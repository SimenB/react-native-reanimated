import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Extrapolation,
  interpolate,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

const data = [
  { artist: 'Nirvana', song: 'Smells Like Teen Spirit' },
  { artist: 'John Lennon', song: 'Imagine' },
  { artist: 'U2', song: 'One' },
  { artist: 'Michael Jackson', song: 'Billie Jean' },
  { artist: 'Queen', song: 'Bohemian Rhapsody' },
  { artist: 'The Beatles', song: 'Hey Jude' },
  { artist: 'Bob Dylan', song: 'Like A Rolling Stone' },
  { artist: 'Rolling Stones', song: "I Can't Get No Satisfaction" },
  { artist: 'Sex Pistols', song: 'God Save The Queen' },
  { artist: "Guns N' Roses", song: "Sweet Child O'Mine" },
];

const ITEM_SIZE = {
  size: 250,
  margin: 70,
};
const SCROLL_MARGIN = 20;
const IPOD_MARGIN = 20;
const SCREEN_WIDTH =
  Dimensions.get('window').width - IPOD_MARGIN * 2 - SCROLL_MARGIN * 2;
const BIG_BALL_SIZE = 200;
const SMALL_BALL_SIZE = 50;
const INNER_BALL_SIZE = BIG_BALL_SIZE - SMALL_BALL_SIZE * 2;

export default function IPodExample() {
  const position = useSharedValue(0);
  const animatedRef = useAnimatedRef<Animated.ScrollView>();

  const itemTotalSize = ITEM_SIZE.size + ITEM_SIZE.margin * 2;
  const borderMargin = SCREEN_WIDTH / 2 - itemTotalSize / 2 + ITEM_SIZE.margin;

  const scrollToNearestItem = (offset: number) => {
    'worklet';
    let minDistance;
    let minDistanceIndex = 0;
    for (let i = 0; i < data.length; ++i) {
      const distance = Math.abs(i * itemTotalSize - offset);
      if (minDistance === undefined || distance < minDistance) {
        minDistance = distance;
        minDistanceIndex = i;
      }
    }

    scrollTo(animatedRef, minDistanceIndex * itemTotalSize, 0, true);
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      position.value = e.contentOffset.x;
    },
    onEndDrag: (e) => {
      scrollToNearestItem(e.contentOffset.x);
    },
    onMomentumEnd: (e) => {
      scrollToNearestItem(e.contentOffset.x);
    },
  });

  const start = useSharedValue({ x: 0, y: 0 });
  const last = useSharedValue({ x: 0, y: 0 });

  const gesture = Gesture.Pan()
    .onBegin((e) => {
      start.value = { x: e.x, y: e.y };
      last.value = { x: e.x, y: e.y };
    })
    .onUpdate((e) => {
      const currentPos = { x: e.x, y: e.y };
      const lastPos = last.value;
      last.value = currentPos;

      if (currentPos.x === lastPos.x && currentPos.y === lastPos.y) {
        // no change so far
        return;
      }

      const changeVector = {
        x: currentPos.x - lastPos.x,
        y: currentPos.y - lastPos.y,
      };
      const toCenterV = {
        x: BIG_BALL_SIZE / 2 - lastPos.x,
        y: BIG_BALL_SIZE / 2 - lastPos.y,
      };
      const crossProd =
        changeVector.x * toCenterV.y - changeVector.y * toCenterV.x;
      if (crossProd === 0) {
        return;
      }

      const dist = Math.hypot(changeVector.x, changeVector.y);
      const sign = crossProd < 0 ? -1 : 1;

      const arr = [0, itemTotalSize * (data.length - 1)];
      position.value = interpolate(
        position.value + sign * dist * 5,
        arr,
        arr,
        Extrapolation.CLAMP
      );
      scrollTo(animatedRef, position.value, 0, false);
    })
    .onEnd(() => {
      scrollToNearestItem(position.value);
    });

  return (
    <View style={styles.ipod}>
      <Animated.ScrollView
        ref={animatedRef}
        horizontal={true}
        style={styles.scroll}
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}>
        {data.map(({ artist, song }, i) => {
          return (
            <SongCover
              artist={artist}
              song={song}
              index={i}
              position={position}
              itemTotalSize={itemTotalSize}
              borderMargin={borderMargin}
              key={i}
            />
          );
        })}
      </Animated.ScrollView>

      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.ballWrapper}>
          <View style={styles.innerBall} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

type SongCoverProps = {
  artist: string;
  song: string;
  index: number;
  position: SharedValue<number>;
  itemTotalSize: number;
  borderMargin: number;
};

function SongCover({
  artist,
  song,
  index,
  position,
  itemTotalSize,
  borderMargin,
}: SongCoverProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const style: {
      opacity?: number;
      marginLeft?: number;
      marginRight?: number;
    } = {};
    const itemDistance =
      Math.abs(position.value - index * itemTotalSize) / itemTotalSize;
    let opacity = 1;
    if (itemDistance >= 0.5) {
      opacity = 0.3;
    } else if (itemDistance > 3) {
      opacity = 0;
    }
    style.opacity = opacity;
    if (index === 0) {
      style.marginLeft = borderMargin;
    } else if (index === data.length - 1) {
      style.marginRight = borderMargin;
    }
    return style;
  });

  return (
    <Animated.View style={[styles.item, animatedStyle]}>
      <View style={styles.cover}>
        <Text style={styles.noteText}>♪</Text>
      </View>
      <Text style={styles.label}>{artist}</Text>
      <Text style={[styles.label, styles.songLabel]}>{song}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ipod: {
    backgroundColor: '#D3D3D3',
    margin: 20,
    borderRadius: 20,
  },
  scroll: {
    borderRadius: 20,
    backgroundColor: '#87CEEB',
    margin: SCROLL_MARGIN,
  },
  item: {
    width: ITEM_SIZE.size,
    height: ITEM_SIZE.size,
    margin: ITEM_SIZE.margin,
    backgroundColor: 'orange',
  },
  ballWrapper: {
    borderWidth: 0,
    borderRadius: BIG_BALL_SIZE,
    width: BIG_BALL_SIZE,
    height: BIG_BALL_SIZE,
    marginLeft: SCREEN_WIDTH / 2 - BIG_BALL_SIZE / 2 + SCROLL_MARGIN,
    marginTop: 40,
    marginBottom: 40,
    backgroundColor: 'white',
  },
  innerBall: {
    position: 'absolute',
    width: INNER_BALL_SIZE,
    height: INNER_BALL_SIZE,
    borderRadius: INNER_BALL_SIZE,
    top: SMALL_BALL_SIZE,
    left: SMALL_BALL_SIZE,
    backgroundColor: '#D3D3D3',
  },
  label: {
    fontSize: 15,
    width: ITEM_SIZE.size,
    textAlign: 'center',
  },
  songLabel: {
    fontSize: 20,
  },
  cover: {
    width: 100,
    height: 100,
    backgroundColor: 'white',
    margin: 20,
    marginLeft: ITEM_SIZE.size / 2 - 100 / 2,
  },
  noteText: {
    fontSize: 80,
    textAlign: 'center',
  },
});
