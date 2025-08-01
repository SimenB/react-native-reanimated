/* eslint-disable @typescript-eslint/no-shadow */
'use strict';
import {
  isWorkletFunction,
  makeShareableCloneRecursive,
  runOnUI,
  shareableMappingCache,
} from 'react-native-worklets';

import type { ParsedColorArray } from '../Colors';
import {
  clampRGBA,
  convertToRGBA,
  isColor,
  rgbaArrayToRGBAColor,
  toGammaSpace,
  toLinearSpace,
} from '../Colors';
import { logger, ReanimatedError, SHOULD_BE_USE_WEB } from '../common';
import type {
  AnimatableValue,
  AnimatableValueObject,
  Animation,
  AnimationObject,
  EasingFunction,
  SharedValue,
  Timestamp,
} from '../commonTypes';
import { ReduceMotion } from '../commonTypes';
import type { EasingFunctionFactory } from '../Easing';
import { ReducedMotionManager } from '../ReducedMotion';
import type { HigherOrderAnimation, StyleLayoutAnimation } from './commonTypes';
import type {
  AffineMatrix,
  AffineMatrixFlat,
} from './transformationMatrix/matrixUtils';
import {
  addMatrices,
  decomposeMatrixIntoMatricesAndAngles,
  flatten,
  getRotationMatrix,
  isAffineMatrixFlat,
  multiplyMatrices,
  scaleMatrix,
  subtractMatrices,
} from './transformationMatrix/matrixUtils';

/**
 * This variable has to be an object, because it can't be changed for the
 * worklets if it's a primitive value. We also have to bind it to a separate
 * object to prevent from freezing it in development.
 */
const IN_STYLE_UPDATER = { current: false };
const IN_STYLE_UPDATER_UI = makeShareableCloneRecursive({ current: false });
shareableMappingCache.set(IN_STYLE_UPDATER, IN_STYLE_UPDATER_UI);

const LAYOUT_ANIMATION_SUPPORTED_PROPS = {
  originX: true,
  originY: true,
  width: true,
  height: true,
  borderRadius: true,
  globalOriginX: true,
  globalOriginY: true,
  opacity: true,
  transform: true,
  backgroundColor: true,
};

type LayoutAnimationProp = keyof typeof LAYOUT_ANIMATION_SUPPORTED_PROPS;

export function isValidLayoutAnimationProp(prop: string) {
  'worklet';
  return (prop as LayoutAnimationProp) in LAYOUT_ANIMATION_SUPPORTED_PROPS;
}

if (__DEV__ && ReducedMotionManager.jsValue) {
  logger.warn(
    `Reduced motion setting is enabled on this device. This warning is visible only in the development mode. Some animations will be disabled by default. You can override the behavior for individual animations, see https://docs.swmansion.com/react-native-reanimated/docs/guides/troubleshooting#reduced-motion-setting-is-enabled-on-this-device.`
  );
}

export function assertEasingIsWorklet(
  easing: EasingFunction | EasingFunctionFactory
): void {
  'worklet';
  if (globalThis._WORKLET) {
    // If this is called on UI (for example from gesture handler with worklets), we don't get easing,
    // but its bound copy, which is not a worklet. We don't want to throw any error then.
    return;
  }
  if (SHOULD_BE_USE_WEB) {
    // It is possible to run reanimated on web without plugin, so let's skip this check on web
    return;
  }
  // @ts-ignore typescript wants us to use `in` instead, which doesn't work with host objects
  if (easing?.factory) {
    return;
  }

  if (!isWorkletFunction(easing)) {
    throw new ReanimatedError(
      'The easing function is not a worklet. Please make sure you import `Easing` from react-native-reanimated.'
    );
  }
}

export function initialUpdaterRun<T>(updater: () => T) {
  IN_STYLE_UPDATER.current = true;
  const result = updater();
  IN_STYLE_UPDATER.current = false;
  return result;
}

interface RecognizedPrefixSuffix {
  prefix?: string;
  suffix?: string;
  strippedValue: number;
}

export function recognizePrefixSuffix(
  value: string | number
): RecognizedPrefixSuffix {
  'worklet';
  if (typeof value === 'string') {
    const match = value.match(
      /([A-Za-z]*)(-?\d*\.?\d*)([eE][-+]?[0-9]+)?([A-Za-z%]*)/
    );
    if (!match) {
      throw new ReanimatedError("Couldn't parse animation value.");
    }
    const prefix = match[1];
    const suffix = match[4];
    // number with scientific notation
    const number = match[2] + (match[3] ?? '');
    return { prefix, suffix, strippedValue: parseFloat(number) };
  } else {
    return { strippedValue: value };
  }
}

/**
 * Returns whether the motion should be reduced for a specified config. By
 * default returns the system setting.
 */
const isReduceMotionOnUI = ReducedMotionManager.uiValue;
export function getReduceMotionFromConfig(config?: ReduceMotion) {
  'worklet';
  return !config || config === ReduceMotion.System
    ? isReduceMotionOnUI.value
    : config === ReduceMotion.Always;
}

/**
 * Returns the value that should be assigned to `animation.reduceMotion` for a
 * given config. If the config is not defined, `undefined` is returned.
 */
export function getReduceMotionForAnimation(config?: ReduceMotion) {
  'worklet';
  // if the config is not defined, we want `reduceMotion` to be undefined,
  // so the parent animation knows if it should overwrite it
  if (!config) {
    return undefined;
  }

  return getReduceMotionFromConfig(config);
}

function applyProgressToMatrix(
  progress: number,
  a: AffineMatrix,
  b: AffineMatrix
) {
  'worklet';
  return addMatrices(a, scaleMatrix(subtractMatrices(b, a), progress));
}

function applyProgressToNumber(progress: number, a: number, b: number) {
  'worklet';
  return a + progress * (b - a);
}

function decorateAnimation<T extends AnimationObject | StyleLayoutAnimation>(
  animation: T
): void {
  'worklet';
  const baseOnStart = (animation as Animation<AnimationObject>).onStart;
  const baseOnFrame = (animation as Animation<AnimationObject>).onFrame;

  if ((animation as HigherOrderAnimation).isHigherOrder) {
    animation.onStart = (
      animation: Animation<AnimationObject>,
      value: number,
      timestamp: Timestamp,
      previousAnimation: Animation<AnimationObject>
    ) => {
      if (animation.reduceMotion === undefined) {
        animation.reduceMotion = getReduceMotionFromConfig();
      }
      return baseOnStart(animation, value, timestamp, previousAnimation);
    };
    return;
  }

  const animationCopy = Object.assign({}, animation);
  delete animationCopy.callback;

  const prefNumberSuffOnStart = (
    animation: Animation<AnimationObject>,
    value: string | number,
    timestamp: number,
    previousAnimation: Animation<AnimationObject>
  ) => {
    // recognize prefix, suffix, and updates stripped value on animation start
    const { prefix, suffix, strippedValue } = recognizePrefixSuffix(value);
    animation.__prefix = prefix;
    animation.__suffix = suffix;
    animation.strippedCurrent = strippedValue;
    const { strippedValue: strippedToValue } = recognizePrefixSuffix(
      animation.toValue as string | number
    );
    animation.current = strippedValue;
    animation.startValue = strippedValue;
    animation.toValue = strippedToValue;
    if (previousAnimation && previousAnimation !== animation) {
      const {
        prefix: paPrefix,
        suffix: paSuffix,
        strippedValue: paStrippedValue,
      } = recognizePrefixSuffix(previousAnimation.current as string | number);
      previousAnimation.current = paStrippedValue;
      previousAnimation.__prefix = paPrefix;
      previousAnimation.__suffix = paSuffix;
    }

    baseOnStart(animation, strippedValue, timestamp, previousAnimation);

    animation.current =
      (animation.__prefix ?? '') +
      animation.current +
      (animation.__suffix ?? '');

    if (previousAnimation && previousAnimation !== animation) {
      previousAnimation.current =
        (previousAnimation.__prefix ?? '') +
        // FIXME
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-base-to-string
        previousAnimation.current +
        (previousAnimation.__suffix ?? '');
    }
  };
  const prefNumberSuffOnFrame = (
    animation: Animation<AnimationObject>,
    timestamp: number
  ) => {
    animation.current = animation.strippedCurrent;
    const res = baseOnFrame(animation, timestamp);
    animation.strippedCurrent = animation.current;
    animation.current =
      (animation.__prefix ?? '') +
      animation.current +
      (animation.__suffix ?? '');
    return res;
  };

  const tab = ['R', 'G', 'B', 'A'];
  const colorOnStart = (
    animation: Animation<AnimationObject>,
    value: string | number,
    timestamp: Timestamp,
    previousAnimation: Animation<AnimationObject>
  ): void => {
    let RGBAValue: ParsedColorArray;
    let RGBACurrent: ParsedColorArray;
    let RGBAToValue: ParsedColorArray;
    const res: Array<number> = [];
    if (isColor(value)) {
      RGBACurrent = toLinearSpace(convertToRGBA(animation.current));
      RGBAValue = toLinearSpace(convertToRGBA(value));
      if (animation.toValue) {
        RGBAToValue = toLinearSpace(convertToRGBA(animation.toValue));
      }
    }
    tab.forEach((i, index) => {
      animation[i] = Object.assign({}, animationCopy);
      animation[i].current = RGBACurrent[index];
      animation[i].toValue = RGBAToValue ? RGBAToValue[index] : undefined;
      animation[i].onStart(
        animation[i],
        RGBAValue[index],
        timestamp,
        previousAnimation ? previousAnimation[i] : undefined
      );
      res.push(animation[i].current);
    });

    animation.unroundedCurrent = res;

    // We need to clamp the res values to make sure they are in the correct RGBA range
    clampRGBA(res as ParsedColorArray);

    animation.current = rgbaArrayToRGBAColor(
      toGammaSpace(res as ParsedColorArray)
    );
  };

  const colorOnFrame = (
    animation: Animation<AnimationObject>,
    timestamp: Timestamp
  ): boolean => {
    const res: Array<number> = [];
    let finished = true;
    // We must restore nonscale current to ever end the animation.
    animation.current = animation.nonscaledCurrent;
    tab.forEach((i) => {
      const result = animation[i].onFrame(animation[i], timestamp);
      // We really need to assign this value to result, instead of passing it directly - otherwise once "finished" is false, onFrame won't be called
      finished = finished && result;
      res.push(animation[i].current);
    });

    // We need to clamp the res values to make sure they are in the correct RGBA range
    clampRGBA(res as ParsedColorArray);
    animation.nonscaledCurrent = res;
    animation.current = rgbaArrayToRGBAColor(
      toGammaSpace(res as ParsedColorArray)
    );
    return finished;
  };

  const transformationMatrixOnStart = (
    animation: Animation<AnimationObject>,
    value: AffineMatrixFlat,
    timestamp: Timestamp,
    previousAnimation: Animation<AnimationObject>
  ): void => {
    const toValue = animation.toValue as AffineMatrixFlat;

    animation.startMatrices = decomposeMatrixIntoMatricesAndAngles(value);
    animation.stopMatrices = decomposeMatrixIntoMatricesAndAngles(toValue);

    // We create an animation copy to animate single value between 0 and 100
    // We set limits from 0 to 100 (instead of 0-1) to make spring look good
    // with default thresholds.

    animation[0] = Object.assign({}, animationCopy);
    animation[0].current = 0;
    animation[0].toValue = 100;
    animation[0].onStart(
      animation[0],
      0,
      timestamp,
      previousAnimation ? previousAnimation[0] : undefined
    );

    animation.current = value;
  };

  const transformationMatrixOnFrame = (
    animation: Animation<AnimationObject>,
    timestamp: Timestamp
  ): boolean => {
    let finished = true;
    const result = animation[0].onFrame(animation[0], timestamp);
    // We really need to assign this value to result, instead of passing it directly - otherwise once "finished" is false, onFrame won't be called
    finished = finished && result;

    const progress = animation[0].current / 100;

    const transforms = ['translationMatrix', 'scaleMatrix', 'skewMatrix'];
    const mappedTransforms: Array<AffineMatrix> = [];

    transforms.forEach((key, _) =>
      mappedTransforms.push(
        applyProgressToMatrix(
          progress,
          animation.startMatrices[key],
          animation.stopMatrices[key]
        )
      )
    );

    const [currentTranslation, currentScale, skewMatrix] = mappedTransforms;

    const rotations: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    const mappedRotations: Array<AffineMatrix> = [];

    rotations.forEach((key, _) => {
      const angle = applyProgressToNumber(
        progress,
        animation.startMatrices['r' + key],
        animation.stopMatrices['r' + key]
      );
      mappedRotations.push(getRotationMatrix(angle, key));
    });

    const [rotationMatrixX, rotationMatrixY, rotationMatrixZ] = mappedRotations;

    const rotationMatrix = multiplyMatrices(
      rotationMatrixX,
      multiplyMatrices(rotationMatrixY, rotationMatrixZ)
    );

    const updated = flatten(
      multiplyMatrices(
        multiplyMatrices(
          currentScale,
          multiplyMatrices(skewMatrix, rotationMatrix)
        ),
        currentTranslation
      )
    );

    animation.current = updated;

    return finished;
  };

  const arrayOnStart = (
    animation: Animation<AnimationObject>,
    value: Array<number>,
    timestamp: Timestamp,
    previousAnimation: Animation<AnimationObject>
  ): void => {
    value.forEach((v, i) => {
      animation[i] = Object.assign({}, animationCopy);
      animation[i].current = v;
      animation[i].toValue = (animation.toValue as Array<number>)[i];
      animation[i].onStart(
        animation[i],
        v,
        timestamp,
        previousAnimation ? previousAnimation[i] : undefined
      );
    });
    animation.current = [...value];
  };

  const arrayOnFrame = (
    animation: Animation<AnimationObject>,
    timestamp: Timestamp
  ): boolean => {
    let finished = true;
    (animation.current as Array<number>).forEach((_, i) => {
      const result = animation[i].onFrame(animation[i], timestamp);
      // We really need to assign this value to result, instead of passing it directly - otherwise once "finished" is false, onFrame won't be called
      finished = finished && result;
      (animation.current as Array<number>)[i] = animation[i].current;
    });

    return finished;
  };

  const objectOnStart = (
    animation: Animation<AnimationObject>,
    value: AnimatableValueObject,
    timestamp: Timestamp,
    previousAnimation: Animation<AnimationObject>
  ): void => {
    for (const key in value) {
      animation[key] = Object.assign({}, animationCopy);
      animation[key].onStart = animation.onStart;

      animation[key].current = value[key];
      animation[key].toValue = (animation.toValue as AnimatableValueObject)[
        key
      ];
      animation[key].onStart(
        animation[key],
        value[key],
        timestamp,
        previousAnimation ? previousAnimation[key] : undefined
      );
    }
    animation.current = value;
  };

  const objectOnFrame = (
    animation: Animation<AnimationObject>,
    timestamp: Timestamp
  ): boolean => {
    let finished = true;
    const newObject: AnimatableValueObject = {};
    for (const key in animation.current as AnimatableValueObject) {
      const result = animation[key].onFrame(animation[key], timestamp);
      // We really need to assign this value to result, instead of passing it directly - otherwise once "finished" is false, onFrame won't be called
      finished = finished && result;
      newObject[key] = animation[key].current;
    }
    animation.current = newObject;
    return finished;
  };

  animation.onStart = (
    animation: Animation<AnimationObject>,
    value: number,
    timestamp: Timestamp,
    previousAnimation: Animation<AnimationObject>
  ) => {
    if (animation.reduceMotion === undefined) {
      animation.reduceMotion = getReduceMotionFromConfig();
    }
    if (animation.reduceMotion) {
      if (animation.toValue !== undefined) {
        animation.current = animation.toValue;
      } else {
        // if there is no `toValue`, then the base function is responsible for setting the current value
        baseOnStart(animation, value, timestamp, previousAnimation);
      }
      animation.startTime = 0;
      animation.onFrame = () => true;
      return;
    }
    if (isColor(value)) {
      colorOnStart(animation, value, timestamp, previousAnimation);
      animation.onFrame = colorOnFrame;
      return;
    } else if (isAffineMatrixFlat(value)) {
      transformationMatrixOnStart(
        animation,
        value,
        timestamp,
        previousAnimation
      );
      animation.onFrame = transformationMatrixOnFrame;
      return;
    } else if (Array.isArray(value)) {
      arrayOnStart(animation, value, timestamp, previousAnimation);
      animation.onFrame = arrayOnFrame;
      return;
    } else if (typeof value === 'string') {
      prefNumberSuffOnStart(animation, value, timestamp, previousAnimation);
      animation.onFrame = prefNumberSuffOnFrame;
      return;
    } else if (typeof value === 'object' && value !== null) {
      objectOnStart(animation, value, timestamp, previousAnimation);
      animation.onFrame = objectOnFrame;
      return;
    }
    baseOnStart(animation, value, timestamp, previousAnimation);
  };
}

type AnimationToDecoration<
  T extends AnimationObject | StyleLayoutAnimation,
  U extends AnimationObject | StyleLayoutAnimation,
> = T extends StyleLayoutAnimation
  ? Record<string, unknown>
  : U | (() => U) | AnimatableValue;

export function defineAnimation<
  T extends AnimationObject | StyleLayoutAnimation, // type that's supposed to be returned
  U extends AnimationObject | StyleLayoutAnimation = T, // type that's received
>(starting: AnimationToDecoration<T, U>, factory: () => T): T {
  'worklet';
  if (!globalThis._WORKLET && IN_STYLE_UPDATER.current) {
    return starting as unknown as T;
  }
  const create = () => {
    'worklet';
    const animation = factory();
    decorateAnimation<U>(animation as unknown as U);
    return animation;
  };

  if (globalThis._WORKLET || SHOULD_BE_USE_WEB) {
    return create();
  }
  create.__isAnimationDefinition = true;

  // @ts-expect-error it's fine
  return create;
}

function cancelAnimationNative<TValue>(sharedValue: SharedValue<TValue>): void {
  'worklet';
  // setting the current value cancels the animation if one is currently running
  if (globalThis._WORKLET) {
    sharedValue.value = sharedValue.value; // eslint-disable-line no-self-assign
  } else {
    runOnUI(() => {
      'worklet';
      sharedValue.value = sharedValue.value; // eslint-disable-line no-self-assign
    })();
  }
}

function cancelAnimationWeb<TValue>(sharedValue: SharedValue<TValue>): void {
  // setting the current value cancels the animation if one is currently running
  sharedValue.value = sharedValue.value; // eslint-disable-line no-self-assign
}

/**
 * Lets you cancel a running animation paired to a shared value. The
 * cancellation is asynchronous.
 *
 * @param sharedValue - The shared value of a running animation that you want to
 *   cancel.
 * @see https://docs.swmansion.com/react-native-reanimated/docs/core/cancelAnimation
 */
export const cancelAnimation = SHOULD_BE_USE_WEB
  ? cancelAnimationWeb
  : cancelAnimationNative;
