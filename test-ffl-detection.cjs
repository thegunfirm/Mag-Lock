#!/usr/bin/env node

/**
 * Test script for FFL detection logic
 * Verifies that our unified FFL detection correctly categorizes products
 */

const { requiresFFL, isAmmunition, isAccessory, isCompleteFirearm } = require('./server/utils/ffl-detection');

console.log('🧪 Testing FFL Detection Logic\n');
console.log('=' .repeat(60));

// Test cases with expected results
const testCases = [
  {
    name: 'BCT BATTLE ROPE 2.0 12GA',
    category: 'Shotguns',
    expectedFFL: false,
    expectedType: 'accessory',
    description: 'Cleaning tool (battle rope)'
  },
  {
    name: 'BORESNAKE 12GA W/ DEN',
    category: 'Shotguns', 
    expectedFFL: false,
    expectedType: 'accessory',
    description: 'Bore snake cleaning tool'
  },
  {
    name: 'WIN SX4 12GA 26" 3.5" BLK SYN',
    category: 'Shotguns',
    expectedFFL: true,
    expectedType: 'firearm',
    description: 'Winchester SX4 shotgun'
  },
  {
    name: 'REM 870 HHD 12GA 18.5" 6RD WD',
    category: 'Shotguns',
    expectedFFL: true,
    expectedType: 'firearm',
    description: 'Remington 870 shotgun'
  },
  {
    name: 'FED SPEED-SHOK STEEL 410 3" #6',
    category: 'Shotguns',
    expectedFFL: false,
    expectedType: 'ammunition',
    description: 'Federal shotgun shells'
  },
  // Additional test cases for comprehensive coverage
  {
    name: 'MOSSBERG 500 12GA 28" FIELD',
    category: 'Shotguns',
    expectedFFL: true,
    expectedType: 'firearm',
    description: 'Mossberg 500 shotgun'
  },
  {
    name: 'BENELLI SUPER BLACK EAGLE 3 12GA',
    category: 'Shotguns',
    expectedFFL: true,
    expectedType: 'firearm',
    description: 'Benelli SBE3 shotgun'
  },
  {
    name: 'REMINGTON CHOKE TUBE MOD 12GA',
    category: 'Shotguns',
    expectedFFL: false,
    expectedType: 'accessory',
    description: 'Choke tube accessory'
  },
  {
    name: 'WINCHESTER AA 12GA 2.75" #8 SHOT',
    category: 'Shotguns',
    expectedFFL: false,
    expectedType: 'ammunition',
    description: 'Target load ammunition'
  },
  {
    name: 'HOPPE\'S GUN CLEANING KIT 12GA',
    category: 'Shotguns',
    expectedFFL: false,
    expectedType: 'accessory',
    description: 'Cleaning kit'
  },
  {
    name: 'FEDERAL POWER-SHOK 12GA 00 BUCK',
    category: 'Shotguns',
    expectedFFL: false,
    expectedType: 'ammunition',
    description: 'Buckshot ammunition'
  },
  {
    name: 'BERETTA A400 XPLOR 12GA 28"',
    category: 'Shotguns',
    expectedFFL: true,
    expectedType: 'firearm',
    description: 'Beretta shotgun'
  }
];

let passed = 0;
let failed = 0;

console.log('\n🔍 Running Test Cases:');
console.log('-' .repeat(60));

testCases.forEach((test, index) => {
  console.log(`\nTest ${index + 1}: ${test.description}`);
  console.log(`Product: "${test.name}"`);
  
  // Create product object for testing
  const product = {
    name: test.name,
    category: test.category,
    department_desc: 'Long Guns'
  };
  
  // Test FFL requirement
  const fflRequired = requiresFFL(product);
  const fflStatus = fflRequired === test.expectedFFL ? '✅' : '❌';
  
  // Test product type detection
  const isAmmo = isAmmunition(test.name);
  const isAcc = isAccessory(test.name);
  const isFirearm = isCompleteFirearm(test.name, test.category);
  
  let detectedType = 'unknown';
  if (isAmmo) detectedType = 'ammunition';
  else if (isAcc) detectedType = 'accessory';
  else if (isFirearm) detectedType = 'firearm';
  
  const typeStatus = detectedType === test.expectedType ? '✅' : '❌';
  
  console.log(`  FFL Required: ${fflRequired} (expected: ${test.expectedFFL}) ${fflStatus}`);
  console.log(`  Detected Type: ${detectedType} (expected: ${test.expectedType}) ${typeStatus}`);
  
  // Details
  console.log(`  Detection Details:`);
  console.log(`    - Is Ammunition: ${isAmmo}`);
  console.log(`    - Is Accessory: ${isAcc}`);
  console.log(`    - Is Complete Firearm: ${isFirearm}`);
  
  if (fflStatus === '✅' && typeStatus === '✅') {
    passed++;
    console.log(`  Result: ✅ PASSED`);
  } else {
    failed++;
    console.log(`  Result: ❌ FAILED`);
  }
});

console.log('\n' + '=' .repeat(60));
console.log('\n📊 Test Results Summary:');
console.log(`  ✅ Passed: ${passed}/${testCases.length}`);
console.log(`  ❌ Failed: ${failed}/${testCases.length}`);
console.log(`  Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! FFL detection logic is working correctly.');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the FFL detection logic.');
  process.exit(1);
}