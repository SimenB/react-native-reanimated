import React from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SharedValue } from 'react-native-reanimated';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const indices = [0, 1, 2, 3];

const range = [0, 9999];

const dotSize = 40;

export default function PinExample() {
  const progress = useSharedValue(0);
  const number = useDerivedValue(() => {
    const val = range[0] + Math.round(progress.value * (range[1] - range[0]));
    return val;
  });

  return (
    <SafeAreaView>
      <View style={styles.center}>
        <NumberDisplay number={number} />
        <Text>move dot</Text>
        <View>
          <ProgressBar progress={progress} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function useDigit(number: SharedValue<number>, i: number) {
  return useDerivedValue(() => {
    return Math.floor(number.value / 10 ** i) % 10;
  });
}

function NumberDisplay({ number }: { number: SharedValue<number> }) {
  return (
    <View style={styles.numberContainerOuter}>
      <View style={styles.numberContainerInner}>
        {indices.map((i) => {
          return <Digit number={number} index={i} key={i} />;
        })}
      </View>
    </View>
  );
}

type DigitProps = {
  number: SharedValue<number>;
  index: number;
};

function Digit({ number, index }: DigitProps) {
  const digit = useDigit(number, index);
  const aref = useAnimatedRef<Animated.ScrollView>();

  useDerivedValue(() => {
    if (Platform.OS === 'web') {
      if (aref && aref.current) {
        aref.current.scrollTo({ y: digit.value * 200 });
      }
    } else {
      // TODO fix this
      scrollTo(aref, 0, digit.value * 200, true);
    }
  });

  return (
    <View style={styles.scrollContainer}>
      <Animated.ScrollView ref={aref} showsVerticalScrollIndicator={false}>
        {digits.map((i) => {
          return (
            <View style={styles.digitContainer} key={i}>
              <Text style={styles.font30}>{i}</Text>
            </View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

function ProgressBar({ progress }: { progress: SharedValue<number> }) {
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const max = useSharedValue(0);

  const gesture = Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
    })
    .onUpdate((e) => {
      let newVal = startX.value + e.translationX;
      newVal = Math.min(max.value, newVal);
      newVal = Math.max(0, newVal);
      x.value = newVal;
    })
    .onEnd(() => {
      progress.value = x.value / max.value;
    });

  const stylez = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: x.value }],
    };
  });

  const barStyle = useAnimatedStyle(() => {
    return {
      width: max.value,
    };
  });

  return (
    <View style={styles.container}>
      <View
        onLayout={(e) => {
          max.value = e.nativeEvent.layout.width;
        }}>
        <Animated.View
          style={[
            styles.bar,
            {
              transform: [
                { translateY: dotSize / 2 + 1 },
                { translateX: dotSize / 2 },
              ],
            },
            barStyle,
          ]}
        />
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.dot, stylez]} />
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 100,
    paddingRight: 80,
    paddingLeft: 40,
    width: 300,
  },
  center: {
    alignItems: 'center',
  },
  bar: {
    backgroundColor: 'black',
    height: 2,
    marginRight: 20,
  },
  dot: {
    borderRadius: 100,
    backgroundColor: 'black',
    width: dotSize,
    height: dotSize,
  },
  numberContainerInner: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  numberContainerOuter: {
    height: 400,
    width: 200,
  },
  scrollContainer: {
    height: 200,
    width: Platform.OS === 'web' ? 50 : undefined,
  },
  font30: {
    fontSize: 30,
  },
  digitContainer: {
    height: 200,
    alignItems: 'center',
    flexDirection: 'row',
  },
});
