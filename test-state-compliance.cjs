/**
 * State Compliance Test Script
 * Tests the comprehensive state compliance module
 */

const axios = require('axios');
const colors = require('colors/safe');

const BASE_URL = 'http://localhost:5000';

// Test products
const TEST_PRODUCTS = {
  firearm: {
    sku: 'GLK01USA5', // Glock 19
    name: 'Glock 19 Gen5',
    isFirearm: true,
    magazineCapacity: 15
  },
  highCapMagazine: {
    sku: 'MAG-30RD',
    name: '30 Round Magazine',
    magazineCapacity: 30
  },
  lowCapMagazine: {
    sku: 'MAG-10RD',
    name: '10 Round Magazine',
    magazineCapacity: 10
  },
  ammunition: {
    sku: 'AMMO-9MM',
    name: '9mm Ammunition',
    isAmmunition: true
  }
};

// Test states
const TEST_STATES = {
  CA: 'California',
  MA: 'Massachusetts',
  TX: 'Texas', // No restrictions
  FL: 'Florida' // No restrictions
};

// Helper function to test cart addition with state compliance
async function testCartAddition(product, state, expectedResult) {
  try {
    const response = await axios.post(`${BASE_URL}/api/cart/add`, {
      sku: product.sku,
      quantity: 1,
      shipState: state
    }, {
      validateStatus: () => true // Accept all status codes
    });

    const success = response.status === 200;
    const blocked = response.status === 422;

    if (expectedResult === 'blocked') {
      if (blocked) {
        console.log(colors.green(`✅ ${state}: ${product.name} correctly BLOCKED`));
        console.log(colors.gray(`   Reason: ${response.data.message}`));
        return true;
      } else {
        console.log(colors.red(`❌ ${state}: ${product.name} should be BLOCKED but was allowed`));
        return false;
      }
    } else {
      if (success) {
        console.log(colors.green(`✅ ${state}: ${product.name} correctly ALLOWED`));
        return true;
      } else {
        console.log(colors.red(`❌ ${state}: ${product.name} should be ALLOWED but was blocked`));
        console.log(colors.gray(`   Error: ${response.data.message}`));
        return false;
      }
    }
  } catch (error) {
    console.log(colors.red(`❌ Test failed: ${error.message}`));
    return false;
  }
}

// Test checkout compliance
async function testCheckoutCompliance(cartItems, shippingAddress, expectedResult) {
  const payload = {
    userId: 1, // Test user
    cartItems: cartItems.map(item => ({
      id: `test-${Date.now()}`,
      productId: Math.floor(Math.random() * 1000),
      productName: item.name,
      productSku: item.sku,
      quantity: 1,
      price: 500,
      isFirearm: item.isFirearm || false,
      requiresFFL: item.isFirearm || false,
      magazineCapacity: item.magazineCapacity,
      manufacturer: 'Test Manufacturer'
    })),
    shippingAddress: {
      street: '123 Test St',
      city: 'Test City',
      state: shippingAddress.state,
      zip: '12345'
    },
    paymentMethod: {
      cardNumber: '4111111111111111',
      expirationDate: '12/25',
      cvv: '123'
    },
    customerInfo: {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com'
    },
    skipPaymentProcessing: true // Skip actual payment for testing
  };

  try {
    const response = await axios.post(`${BASE_URL}/api/checkout/process`, payload, {
      validateStatus: () => true
    });

    const success = response.status === 200 && response.data.success;
    const blocked = !success && response.data.error?.includes('state regulations');

    if (expectedResult === 'blocked') {
      if (blocked) {
        console.log(colors.green(`✅ Checkout to ${shippingAddress.state}: correctly BLOCKED`));
        console.log(colors.gray(`   Reason: ${response.data.error}`));
        return true;
      } else {
        console.log(colors.red(`❌ Checkout to ${shippingAddress.state}: should be BLOCKED but was allowed`));
        return false;
      }
    } else {
      if (success) {
        console.log(colors.green(`✅ Checkout to ${shippingAddress.state}: correctly ALLOWED`));
        return true;
      } else {
        console.log(colors.red(`❌ Checkout to ${shippingAddress.state}: should be ALLOWED but was blocked`));
        console.log(colors.gray(`   Error: ${response.data.error}`));
        return false;
      }
    }
  } catch (error) {
    console.log(colors.red(`❌ Checkout test failed: ${error.message}`));
    return false;
  }
}

async function runTests() {
  console.log(colors.cyan('\n========================================'));
  console.log(colors.cyan('State Compliance Module Test Suite'));
  console.log(colors.cyan('========================================\n'));

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: California - Should block ALL firearms and ammunition
  console.log(colors.yellow('\n📍 Test 1: California Compliance (Should block all firearms/ammo)\n'));
  
  totalTests++;
  if (await testCartAddition(TEST_PRODUCTS.firearm, 'CA', 'blocked')) passedTests++;
  
  totalTests++;
  if (await testCartAddition(TEST_PRODUCTS.ammunition, 'CA', 'blocked')) passedTests++;
  
  totalTests++;
  if (await testCartAddition(TEST_PRODUCTS.highCapMagazine, 'CA', 'blocked')) passedTests++;

  // Test 2: Massachusetts - Should block high capacity magazines
  console.log(colors.yellow('\n📍 Test 2: Massachusetts Compliance (10-round limit)\n'));
  
  totalTests++;
  if (await testCartAddition(TEST_PRODUCTS.highCapMagazine, 'MA', 'blocked')) passedTests++;
  
  totalTests++;
  if (await testCartAddition(TEST_PRODUCTS.lowCapMagazine, 'MA', 'allowed')) passedTests++;

  // Test 3: Texas - Should allow everything (no restrictions)
  console.log(colors.yellow('\n📍 Test 3: Texas (No restrictions - should allow all)\n'));
  
  totalTests++;
  if (await testCartAddition(TEST_PRODUCTS.firearm, 'TX', 'allowed')) passedTests++;
  
  totalTests++;
  if (await testCartAddition(TEST_PRODUCTS.highCapMagazine, 'TX', 'allowed')) passedTests++;
  
  totalTests++;
  if (await testCartAddition(TEST_PRODUCTS.ammunition, 'TX', 'allowed')) passedTests++;

  // Test 4: Checkout compliance for California
  console.log(colors.yellow('\n📍 Test 4: Checkout Compliance - California\n'));
  
  totalTests++;
  if (await testCheckoutCompliance(
    [TEST_PRODUCTS.firearm],
    { state: 'CA' },
    'blocked'
  )) passedTests++;

  // Test 5: Checkout compliance for Massachusetts with high-cap magazine
  console.log(colors.yellow('\n📍 Test 5: Checkout Compliance - Massachusetts (high-cap mag)\n'));
  
  totalTests++;
  if (await testCheckoutCompliance(
    [TEST_PRODUCTS.highCapMagazine],
    { state: 'MA' },
    'blocked'
  )) passedTests++;

  // Test 6: Checkout compliance for Texas (should allow)
  console.log(colors.yellow('\n📍 Test 6: Checkout Compliance - Texas (no restrictions)\n'));
  
  totalTests++;
  if (await testCheckoutCompliance(
    [TEST_PRODUCTS.firearm, TEST_PRODUCTS.highCapMagazine],
    { state: 'TX' },
    'allowed'
  )) passedTests++;

  // Summary
  console.log(colors.cyan('\n========================================'));
  console.log(colors.cyan('Test Summary'));
  console.log(colors.cyan('========================================\n'));
  
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);
  
  if (passedTests === totalTests) {
    console.log(colors.green(`✅ ALL TESTS PASSED! (${passedTests}/${totalTests})`));
  } else {
    console.log(colors.yellow(`⚠️ ${passedTests}/${totalTests} tests passed (${passRate}%)`));
  }
  
  console.log(colors.cyan('\n========================================'));
  console.log(colors.cyan('State Compliance Rules Summary:'));
  console.log(colors.cyan('========================================'));
  console.log(colors.white('\n• California (CA): All firearms and ammunition BLOCKED'));
  console.log(colors.white('• Massachusetts (MA): 10-round magazine capacity limit'));
  console.log(colors.white('• New York (NY): 10-round magazine capacity limit'));
  console.log(colors.white('• New Jersey (NJ): 10-round magazine capacity limit'));
  console.log(colors.white('• Connecticut (CT): 10-round magazine capacity limit'));
  console.log(colors.white('• Other states: No restrictions (for now)\n'));

  return passedTests === totalTests;
}

// Run the tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error(colors.red('Fatal error:'), error);
  process.exit(1);
});