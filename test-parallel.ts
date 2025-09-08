import * as lucidic from './src/index';
import * as dotenv from 'dotenv';

dotenv.config();

async function testParallelProcessing() {
    console.log('🚀 Testing Parallel Event Processing');
    console.log('=' .repeat(60));
    
    // set batch size for testing
    process.env.LUCIDIC_BATCH_SIZE = '5';
    process.env.LUCIDIC_VERBOSE = 'true';
    process.env.LUCIDIC_DEBUG = 'true';
    
    console.log('Configuration:');
    console.log(`  LUCIDIC_BATCH_SIZE: ${process.env.LUCIDIC_BATCH_SIZE}`);
    console.log(`  LUCIDIC_MAX_CONCURRENCY: ${process.env.LUCIDIC_MAX_CONCURRENCY || '10'}`);
    
    // initialize session
    const sessionId = await lucidic.init({
        sessionName: 'Parallel Processing Test',
        apiKey: process.env.LUCIDIC_API_KEY || 'test-api-key',
        agentId: process.env.LUCIDIC_AGENT_ID || 'test-agent',
    });
    
    console.log(`\nSession initialized: ${sessionId}`);
    
    // create multiple events
    console.log('\n📝 Creating 20 test events...');
    const startTime = Date.now();
    
    for (let i = 1; i <= 20; i++) {
        lucidic.createEvent({
            type: 'generic',
            details: `Test event ${i}`,
            metadata: {
                eventNumber: i,
                timestamp: new Date().toISOString(),
                testData: 'This is test data for the event',
            }
        });
        console.log(`  Created event ${i}`);
    }
    
    console.log('\n⏳ Flushing events (parallel processing)...');
    const flushStart = Date.now();
    await lucidic.flush();
    const flushTime = Date.now() - flushStart;
    
    console.log(`\n✅ Events flushed in ${flushTime}ms`);
    console.log(`Total time: ${Date.now() - startTime}ms`);
    
    // end session
    await lucidic.endSession({
        isSuccessful: true,
        metadata: {
            totalEvents: 20,
            flushTime: flushTime,
            batchSize: process.env.LUCIDIC_BATCH_SIZE,
        }
    });
    
    console.log('\n🎉 Test complete!');
    console.log('\nExpected behavior:');
    console.log('- Events should be processed in batches of 5');
    console.log('- Debug logs should show "Processing batch of X events"');
    console.log('- Flush time should be significantly faster than sequential');
}

// run test
testParallelProcessing()
    .then(() => {
        console.log('\n👋 Exiting...');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Test failed:', error);
        process.exit(1);
    });