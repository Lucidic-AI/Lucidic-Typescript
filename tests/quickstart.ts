import * as lai from '../src/index';

async function main() {
  try {
    // Initialize the SDK
    await lai.init({
      apiKey: 'your-api-key',    // or set LUCIDIC_API_KEY env var
      agentId: 'your-agent-id',  // or set LUCIDIC_AGENT_ID env var
      sessionName: 'My AI Assistant',
      providers: ['openai']      // Auto-instrument providers
    });

    // IMPORTANT: Import LLM libraries AFTER lai.init()
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({apiKey: 'your-openai-key'});

    // Your LLM calls are now automatically tracked!
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello! What is the capital of France?'}]
    });

    console.log('Response:', response.choices[0].message.content);
    
    // Session auto-ends when process exits
    console.log('Session will auto-end on exit');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the main function
main();
