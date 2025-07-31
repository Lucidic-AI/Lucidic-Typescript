import * as dotenv from 'dotenv';
import * as lai from '../src/index';

// Load environment variables
dotenv.config();

async function testGetPrompt() {
  console.log('Testing getPrompt functionality...\n');
  
  // Debug: Check environment variables
  console.log('Environment check:');
  console.log('- LUCIDIC_API_KEY:', process.env.LUCIDIC_API_KEY ? '✓ Set' : '✗ Not set');
  console.log('- LUCIDIC_AGENT_ID:', process.env.LUCIDIC_AGENT_ID ? '✓ Set' : '✗ Not set (will use test-agent)');
  console.log('');

  try {
    // Initialize the SDK
    await lai.init({
      sessionName: 'getPrompt Test Session',
      apiKey: process.env.LUCIDIC_API_KEY,
      agentId: process.env.LUCIDIC_AGENT_ID || 'test-agent', // Use test-agent if not in env
    });

    console.log('✓ SDK initialized successfully\n');

    // Test getPrompt with the specified parameters
    console.log('Fetching prompt with:');
    console.log('- name: "test"');
    console.log('- label: "yeehaw2"');
    console.log('- variables: { nam: "test", tt: "works", ver: "yeehaw" }\n');

    const prompt = await lai.getPrompt({
      name: 'test',
      label: 'yeehaw2',
      variables: {
        nam: 'test',
        tt: 'works',
        ver: 'yeehaw'
      },
      cache: 300 // Use default caching
    });

    console.log('✓ Prompt fetched successfully!\n');
    console.log('Result:');
    console.log('-------');
    console.log(prompt);
    console.log('-------\n');

    // Test caching by fetching again
    console.log('Testing cache (fetching same prompt again)...');
    const startTime = Date.now();
    const cachedPrompt = await lai.getPrompt({
      name: 'test',
      label: 'yeehaw2',
      variables: {
        nam: 'test',
        tt: 'works',
        ver: 'yeehaw'
      }
    });
    const fetchTime = Date.now() - startTime;
    
    console.log(`✓ Cached prompt fetched in ${fetchTime}ms\n`);
    console.log('Cached result matches:', prompt === cachedPrompt ? '✓ Yes' : '✗ No');

    // End the session
    await lai.endSession();
    console.log('\n✓ Session ended successfully');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    
    // Try to end session even if test fails
    try {
      await lai.endSession();
    } catch (endError) {
      // Ignore errors when ending session after failure
    }
    
    process.exit(1);
  }
}

// Run the test
console.log('Starting getPrompt test...\n');
testGetPrompt()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });