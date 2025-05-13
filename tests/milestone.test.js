/**
 * Unit tests for milestone burn functionality
 */
const { 
  BURN_SCHEDULE, 
  getNextMilestone, 
  getPendingMilestones,
  calculateTotalBurnAmount 
} = require('../src/scripts/milestone/burnConfig');

describe('Milestone Burn Configuration', () => {
  test('BURN_SCHEDULE should have 19 milestones', () => {
    expect(BURN_SCHEDULE).toBeDefined();
    expect(BURN_SCHEDULE.length).toBe(19);
  });
  
  test('Total burn percentage should be 30%', () => {
    const totalPercent = BURN_SCHEDULE.reduce(
      (total, milestone) => total + milestone.percentOfSupply, 
      0
    );
    
    expect(totalPercent).toBeCloseTo(30.0, 1);
  });
  
  test('Burn schedule should be in ascending order by market cap', () => {
    for (let i = 1; i < BURN_SCHEDULE.length; i++) {
      expect(BURN_SCHEDULE[i].marketCap).toBeGreaterThan(BURN_SCHEDULE[i-1].marketCap);
    }
  });
});

describe('getNextMilestone function', () => {
  test('should return the first milestone when market cap is exactly at threshold', () => {
    const result = getNextMilestone(100000, []);
    expect(result).toBeDefined();
    expect(result.marketCap).toBe(100000);
  });
  
  test('should return null when market cap is below all thresholds', () => {
    const result = getNextMilestone(50000, []);
    expect(result).toBeNull();
  });
  
  test('should skip completed milestones', () => {
    const result = getNextMilestone(300000, [100000, 200000]);
    expect(result).toBeDefined();
    expect(result.marketCap).toBe(300000);
  });
  
  test('should return null when all eligible milestones are completed', () => {
    const result = getNextMilestone(500000, [100000, 200000, 300000, 500000]);
    expect(result).toBeNull();
  });
});

describe('getPendingMilestones function', () => {
  test('should return all eligible milestones that are not completed', () => {
    const result = getPendingMilestones(500000, [100000]);
    expect(result).toBeDefined();
    expect(result.length).toBe(3); // 200K, 300K, 500K
    expect(result[0].marketCap).toBe(200000);
    expect(result[2].marketCap).toBe(500000);
  });
  
  test('should return empty array when market cap is below all thresholds', () => {
    const result = getPendingMilestones(50000, []);
    expect(result).toEqual([]);
  });
  
  test('should return empty array when all eligible milestones are completed', () => {
    const result = getPendingMilestones(500000, [100000, 200000, 300000, 500000]);
    expect(result).toEqual([]);
  });
});

describe('calculateTotalBurnAmount function', () => {
  test('should calculate total burn amount correctly', () => {
    const milestones = [
      { burnAmount: 10000 },
      { burnAmount: 20000 },
      { burnAmount: 30000 }
    ];
    
    const result = calculateTotalBurnAmount(milestones);
    expect(result).toBe(60000);
  });
  
  test('should return 0 for empty milestone array', () => {
    const result = calculateTotalBurnAmount([]);
    expect(result).toBe(0);
  });
});