'use strict';
import { logger } from '../../../common';
import type { Percentage } from '../../types';
import { ERROR_MESSAGES, LinearEasing, WARN_MESSAGES } from '../linear';
import type { ControlPoint } from '../types';

const warn = jest.fn();
logger.warn = warn;

describe(LinearEasing, () => {
  describe('constructor', () => {
    it('throws error if points count is less than 2', () => {
      expect(() => new LinearEasing([])).toThrow(
        ERROR_MESSAGES.invalidPointsCount()
      );
      expect(() => new LinearEasing([0.5])).toThrow(
        ERROR_MESSAGES.invalidPointsCount()
      );
    });
  });

  describe('toString', () => {
    it.each([
      [[0, 1], 'linear(0, 1)'],
      [[0, 0.5, 1], 'linear(0, 0.5, 1)'],
      [[0, 0.25, 0.5, 0.75, 1], 'linear(0, 0.25, 0.5, 0.75, 1)'],
      [
        [0, [0.1, '25%'], [0.75, '50%'], 1],
        'linear(0, [0.1, "25%"], [0.75, "50%"], 1)',
      ],
      [[0, [0.25, '25%', '75%'], 1], 'linear(0, [0.25, "25%", "75%"], 1)'],
    ] satisfies [ControlPoint[], string][])(
      'for %s returns %s',
      (points, expected) => {
        const easing = new LinearEasing(points);
        expect(easing.toString()).toBe(expected);
      }
    );
  });

  describe('normalize', () => {
    describe('input progress', () => {
      it('Throws error if input progress is lower than 0%', () => {
        const easing = new LinearEasing([[0, '-10%'], 1]);
        expect(() => easing.normalize()).toThrow(
          ERROR_MESSAGES.invalidInputProgressValue('-10%')
        );
      });

      it('Throws error if input progress is greater than 100%', () => {
        const easing = new LinearEasing([[0, '110%'], 1]);
        expect(() => easing.normalize()).toThrow(
          ERROR_MESSAGES.invalidInputProgressValue('110%')
        );
      });

      it('Throws error if input progress is not a percentage', () => {
        const easing = new LinearEasing([[0, '10' as Percentage], 1]);
        expect(() => easing.normalize()).toThrow(
          ERROR_MESSAGES.invalidInputProgressValue('10')
        );
      });
    });

    describe('canonicalization', () => {
      beforeEach(() => {
        warn.mockClear();
      });

      it('Sets output progress of the first point to 0 if it is not set', () => {
        const easing = new LinearEasing([0.25, 1]);
        expect(easing.normalize().points[0]).toEqual({ x: 0, y: 0.25 });
      });

      it('Sets output progress of the last point to 1 if it is not set', () => {
        const easing = new LinearEasing([0, 0.25]);
        expect(easing.normalize().points[1]).toEqual({ x: 1, y: 0.25 });
      });

      it('sets max preceding input progress if the input progress of the point is less than the input progress of the preceding point', () => {
        const easing = new LinearEasing([
          0,
          [0.25, '90%'],
          [0.5, '80%'],
          [0.75, '70%'],
          1,
        ]);

        expect(easing.normalize().points).toEqual([
          { x: 0, y: 0 },
          { x: 0.9, y: 0.25 },
          { x: 0.9, y: 0.5 },
          { x: 0.9, y: 0.75 },
          { x: 1, y: 1 },
        ]);
      });

      it('warns if the input progress of the point is less than the input progress of the preceding point and is overridden', () => {
        new LinearEasing([
          0,
          [0.25, '90%'],
          [0.5, '80%'],
          [0.75, '70%'],
          1,
        ]).normalize();

        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenNthCalledWith(
          1,
          WARN_MESSAGES.inputProgressLessThanPrecedingPoint(0.8, 0.9)
        );
        expect(warn).toHaveBeenNthCalledWith(
          2,
          WARN_MESSAGES.inputProgressLessThanPrecedingPoint(0.7, 0.9)
        );
      });

      it('spaces points evenly on the x axis between 2 known points', () => {
        const easing = new LinearEasing([
          0,
          [0.5, '20%'],
          0.4,
          0.6,
          0.2,
          [0.1, '80%'],
          1,
        ]);

        // These floating point numbers with many zeros are the result of
        // the precision loss during calculations.
        expect(easing.normalize().points).toEqual([
          { x: 0, y: 0 },
          { x: 0.2, y: 0.5 },
          // x +0.15
          { x: 0.35000000000000003, y: 0.4 },
          // x +0.15
          { x: 0.5, y: 0.6 },
          // x +0.15
          { x: 0.6500000000000001, y: 0.2 },
          // x +0.15
          { x: 0.8, y: 0.1 },
          { x: 1, y: 1 },
        ]);
      });
    });
  });
});
