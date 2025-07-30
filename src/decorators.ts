import { StepConfig } from './types';
import { createStep, endStep } from './index';
import { logger } from './utils/logger';

/**
 * Decorator function that creates a step, runs the function, and automatically ends the step
 * @param stepConfig Step configuration (optional)
 */
export function step(stepConfig: StepConfig = {}) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      let currentStep;
      try {
        // Create the step
        currentStep = await createStep(stepConfig);
        logger.debug(`Step created: ${currentStep.stepId}`);
        
        // Execute the wrapped function
        const result = await originalMethod.apply(this, args);
        
        // End step successfully
        await endStep({ evalScore: 100, evalDescription: 'Step completed successfully' });
        
        return result;
      } catch (error) {
        // End step with error indication
        try {
          await endStep({ evalScore: 0, evalDescription: `Step failed with error: ${error}` });
        } catch (endError) {
          logger.error(`Failed to end step after error: ${endError}`);
        }
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Wrap an async function to create and end a step automatically
 * @param fn The function to wrap
 * @param stepConfig Step configuration (optional)
 */
export function withStep<T extends (...args: any[]) => Promise<any>>(
  fn: T, 
  stepConfig: StepConfig = {}
): T {
  return (async (...args: any[]) => {
    let currentStep;
    try {
      // Create the step
      currentStep = await createStep(stepConfig);
      logger.debug(`Step created: ${currentStep.stepId}`);
      
      // Execute the wrapped function
      const result = await fn(...args);
      
      // End step successfully
      await endStep({ evalScore: 100, evalDescription: 'Step completed successfully' });
      
      return result;
    } catch (error) {
      // End step with error indication
      try {
        await endStep({ evalScore: 0, evalDescription: `Step failed with error: ${error}` });
      } catch (endError) {
        logger.error(`Failed to end step after error: ${endError}`);
      }
      throw error;
    }
  }) as T;
}