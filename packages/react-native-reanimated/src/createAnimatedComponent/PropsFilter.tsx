'use strict';

import { initialUpdaterRun } from '../animation';
import type { StyleProps } from '../commonTypes';
import type { AnimatedStyleHandle } from '../hook/commonTypes';
import { isSharedValue } from '../isSharedValue';
import { WorkletEventHandler } from '../WorkletEventHandler';
import type {
  AnimatedComponentProps,
  AnimatedComponentType,
  AnimatedProps,
  InitialComponentProps,
  IPropsFilter,
} from './commonTypes';
import { getInlineStyle, hasInlineStyles } from './InlinePropManager';
import { flattenArray, has } from './utils';

function dummyListener() {
  // empty listener we use to assign to listener properties for which animated
  // event is used.
}

export class PropsFilter implements IPropsFilter {
  private _initialPropsMap = new Map<AnimatedStyleHandle, StyleProps>();

  public filterNonAnimatedProps(
    component: AnimatedComponentType
  ): Record<string, unknown> {
    const inputProps =
      component.props as AnimatedComponentProps<InitialComponentProps>;
    const props: Record<string, unknown> = {};

    for (const key in inputProps) {
      const value = inputProps[key];
      if (key === 'style') {
        const styleProp = inputProps.style;
        const styles = flattenArray<StyleProps>(styleProp ?? []);

        const processedStyle: StyleProps[] = styles.map((style) => {
          if (style?.viewDescriptors) {
            const handle = style as AnimatedStyleHandle;

            if (component._isFirstRender) {
              this._initialPropsMap.set(handle, {
                ...handle.initial.value,
                ...initialUpdaterRun(handle.initial.updater),
              } as StyleProps);
            }

            return this._initialPropsMap.get(handle) ?? {};
          } else if (hasInlineStyles(style)) {
            return getInlineStyle(style, component._isFirstRender);
          } else {
            return style;
          }
        });
        // keep styles as they were passed by the user
        // it will help other libs to interpret styles correctly
        props[key] = processedStyle;
      } else if (key === 'animatedProps') {
        const animatedPropsProp = inputProps.animatedProps;
        const animatedPropsArray = flattenArray<
          Partial<AnimatedComponentProps<AnimatedProps>>
        >(animatedPropsProp ?? []);

        animatedPropsArray.forEach((animatedProps) => {
          if (animatedProps?.viewDescriptors && animatedProps.initial) {
            Object.keys(animatedProps.initial.value).forEach(
              (initialValueKey) => {
                props[initialValueKey] =
                  animatedProps.initial?.value[initialValueKey];
              }
            );
          }
        });
      } else if (
        has('workletEventHandler', value) &&
        value.workletEventHandler instanceof WorkletEventHandler
      ) {
        if (value.workletEventHandler.eventNames.length > 0) {
          value.workletEventHandler.eventNames.forEach((eventName) => {
            props[eventName] = has('listeners', value.workletEventHandler)
              ? (
                  value.workletEventHandler.listeners as Record<string, unknown>
                )[eventName]
              : dummyListener;
          });
        } else {
          props[key] = dummyListener;
        }
      } else if (isSharedValue(value)) {
        if (component._isFirstRender) {
          props[key] = value.value;
        }
      } else {
        props[key] = value;
      }
    }
    return props;
  }
}
