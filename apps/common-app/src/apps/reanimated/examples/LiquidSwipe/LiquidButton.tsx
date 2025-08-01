import React from 'react';
import { Dimensions, Text } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const size = 50;

type ButtonProps = {
  progress: SharedValue<number>;
  y: SharedValue<number>;
};

export default function LiquidButton({ progress, y }: ButtonProps) {
  const style = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        progress.value,
        [0, 0.1],
        [1, 0],
        Extrapolation.CLAMP
      ),
      transform: [
        {
          translateX: interpolate(
            progress.value,
            [0, 0.4],
            [width - size - 8, 0]
          ),
        },
        {
          translateY: y.value - size / 2,
        },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          justifyContent: 'center',
          alignItems: 'center',
        },
        style,
      ]}>
      <Text>(</Text>
    </Animated.View>
  );
}
