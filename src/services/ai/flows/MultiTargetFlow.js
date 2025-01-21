import { BaseFlow } from './BaseFlow.js';
import { walletService } from '../../wallet/index.js';
import { timedOrderService } from '../../timedOrders.js';
import { tokenInfoService } from '../../tokens/TokenInfoService.js';
import { ErrorHandler } from '../../../core/errors/index.js';

export class MultiTargetFlow extends BaseFlow {
  constructor() {
    super();
    this.steps = ['token', 'amount', 'targets', 'confirmation'];
  }

  async start(initialData = {}) {
    return {
      currentStep: 0,
      data: initialData,
      response: 'Please enter the token address or symbol you want to trade:'
    };
  }

  async processStep(state, input) {
    try {
      const currentStep = this.steps[state.currentStep];

      switch (currentStep) {
        case 'token':
          return this.processTokenStep(input, state);
        case 'amount':
          return this.processAmountStep(input, state);
        case 'targets':
          return this.processTargetsStep(input, state);
        case 'confirmation':
          return this.processConfirmation(input, state);
        default:
          throw new Error('Invalid flow step');
      }
    } catch (error) {
      await ErrorHandler.handle(error);
      throw error;
    }
  }

  async processTokenStep(input, state) {
    try {
      // Get current network
      const network = await networkState.getCurrentNetwork(state.userId);
  
      // For natural language, try to extract token info
      if (state.naturalLanguageInput) {
        // Try to find token in natural language input
        const tokenMatch = input.match(/\b(?:of|for)\s+([a-zA-Z0-9]+)\b/i);
        if (tokenMatch) {
          const tokenInput = tokenMatch[1];
          const tokenInfo = await tokenInfoService.validateToken(network, tokenInput);
          
          if (tokenInfo) {
            return {
              completed: false,
              flowData: {
                ...state,
                currentStep: 1,
                token: tokenInfo
              },
              response: `Great! I found ${tokenInfo.symbol} at ${tokenInfo.address}. Is this correct? (yes/no)`
            };
          }
        }
        
        // If token not found, prompt user
        return {
          completed: false,
          flowData: state,
          response: "I couldn't find that token. Please provide the token address:",
          keyboard: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'cancel_order' }
            ]]
          }
        };
      }
  
      // For manual input, validate token address or symbol
      const tokenInfo = await tokenInfoService.validateToken(network, input.trim());
      if (!tokenInfo) {
        return {
          completed: false,
          flowData: state,
          response: "Invalid token. Please provide a valid token address or symbol:",
          keyboard: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'cancel_order' }
            ]]
          }
        };
      }
  
      return {
        completed: false,
        flowData: {
          ...state,
          currentStep: 1,
          token: tokenInfo
        },
        response: `Found ${tokenInfo.symbol}. How much would you like to trade initially?`
      };
    } catch (error) {
      await ErrorHandler.handle(error);
      return {
        completed: false,
        flowData: state,
        response: "Error validating token. Please try again:",
        keyboard: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'cancel_order' }
          ]]
        }
      };
    }
  }  

  async processAmountStep(input, state) {
    const amount = parseFloat(input);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Invalid amount');
    }

    return {
      completed: false,
      flowData: {
        ...state,
        currentStep: 2,
        amount
      },
      response: 'Enter your take-profit targets in this format:\n' +
                '50% at 2x, 25% at 3x, 25% at 5x\n' +
                'Or simply: 2x, 3x, 5x for equal splits'
    };
  }

  async processTargetsStep(input, state) {
    const targets = this.parseTargets(input);
    
    return {
      completed: false,
      flowData: {
        ...state,
        currentStep: 3,
        targets
      },
      response: this.formatConfirmation(state, targets)
    };
  }

  async processConfirmation(input, state) {
    const confirmed = input.toLowerCase() === 'yes';
    
    if (!confirmed) {
      return this.cancel(state);
    }

    // Create orders for each target
    const orders = await Promise.all(
      state.targets.map(target => 
        timedOrderService.createOrder(state.userId, {
          tokenAddress: state.token.address,
          network: state.token.network,
          action: 'sell',
          amount: `${target.percentage}%`,
          conditions: {
            targetPrice: target.multiplier * state.token.price
          }
        })
      )
    );

    return this.complete({
      ...state,
      orders
    });
  }

  parseTargets(input) {
    // Handle percentage format: "50% at 2x, 25% at 3x, 25% at 5x"
    if (input.includes('%')) {
      return input.split(',').map(target => {
        const [percentage, multiplier] = target.trim().split(' at ');
        return {
          percentage: parseFloat(percentage),
          multiplier: parseFloat(multiplier.replace('x', ''))
        };
      });
    }

    // Handle simple format: "2x, 3x, 5x"
    const multipliers = input.split(',').map(x => parseFloat(x.trim().replace('x', '')));
    const percentage = 100 / multipliers.length;
    
    return multipliers.map(multiplier => ({
      percentage,
      multiplier
    }));
  }

  formatConfirmation(state, targets) {
    return `Please confirm your multi-target order:\n\n` +
           `Token: ${state.token.symbol}\n` +
           `Initial Buy: ${state.amount} ${state.token.symbol}\n\n` +
           `Targets:\n` +
           targets.map(t => `• Sell ${t.percentage}% at ${t.multiplier}x`).join('\n') +
           `\n\nType 'yes' to confirm or 'no' to cancel`;
  }
}