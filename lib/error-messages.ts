export interface UserFriendlyError {
  title: string;
  description: string;
  variant: 'destructive' | 'warning' | 'info' | 'success';
  icon?: string;
}

export function getUserFriendlyError(error: any): UserFriendlyError {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Balance/Insufficient funds errors
  if (lowerMessage.includes('insufficient') || lowerMessage.includes('not enough')) {
    if (lowerMessage.includes('balance')) {
      return {
        title: '💰 Insufficient Balance',
        description: 'You don\'t have enough funds for this trade. Please deposit more or reduce your bet amount.',
        variant: 'warning',
        icon: 'wallet',
      };
    }
    return {
      title: '⚠️ Insufficient Funds',
      description: message + ' Please check your available balance.',
      variant: 'warning',
      icon: 'alert-triangle',
    };
  }

  // Authentication/Authorization errors
  if (lowerMessage.includes('authentication') || lowerMessage.includes('unauthorized') || lowerMessage.includes('not authenticated')) {
    return {
      title: '🔐 Sign In Required',
      description: 'Please sign in to your account to continue trading.',
      variant: 'info',
      icon: 'lock',
    };
  }

  if (lowerMessage.includes('forbidden') || lowerMessage.includes('not authorized')) {
    return {
      title: '🚫 Access Denied',
      description: 'You don\'t have permission to perform this action.',
      variant: 'destructive',
      icon: 'shield-alert',
    };
  }

  // Risk management and limits
  if (lowerMessage.includes('risk check failed')) {
    return {
      title: '⚠️ Risk Limit Reached',
      description: message.replace('Risk Check Failed: ', '').replace('Risk Check Failed', '') + ' Try a smaller amount to stay within safe limits.',
      variant: 'warning',
      icon: 'alert-triangle',
    };
  }

  if (lowerMessage.includes('slippage')) {
    return {
      title: '📊 High Slippage Detected',
      description: 'This trade would move the price significantly. Consider reducing your amount or using a limit order.',
      variant: 'warning',
      icon: 'trending-up',
    };
  }

  if (lowerMessage.includes('order size') || lowerMessage.includes('too large')) {
    return {
      title: '📏 Order Too Large',
      description: 'This order is too large relative to market liquidity. Please reduce your amount.',
      variant: 'warning',
      icon: 'alert-circle',
    };
  }

  // Rate limiting and cooldowns
  if (lowerMessage.includes('cooldown') || lowerMessage.includes('too quickly') || lowerMessage.includes('wait')) {
    return {
      title: '⏱️ Please Wait',
      description: 'You\'re trading too quickly. Please wait a moment before trying again.',
      variant: 'warning',
      icon: 'clock',
    };
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return {
      title: '🚦 Rate Limit Exceeded',
      description: 'Too many requests. Please wait a moment and try again.',
      variant: 'warning',
      icon: 'alert-octagon',
    };
  }

  if (lowerMessage.includes('daily trade limit')) {
    return {
      title: '📅 Daily Limit Reached',
      description: 'You\'ve reached your daily trading limit for this market. Limit resets at midnight UTC.',
      variant: 'warning',
      icon: 'calendar',
    };
  }

  // Withdrawal specific errors
  if (lowerMessage.includes('daily withdrawal limit')) {
    const match = message.match(/remaining today:\s*(\d+(?:\.\d+)?)/i);
    const remaining = match ? match[1] : '0';
    return {
      title: '📅 Daily Withdrawal Limit',
      description: `You've reached your daily withdrawal limit. You can withdraw up to $${remaining} more today. Limits reset at midnight UTC.`,
      variant: 'warning',
      icon: 'calendar-x',
    };
  }

  if (lowerMessage.includes('must place at least one bet')) {
    return {
      title: '🎯 Place Your First Bet',
      description: 'You need to place at least one bet before you can withdraw funds. This helps prevent fraud.',
      variant: 'info',
      icon: 'info',
    };
  }

  if (lowerMessage.includes('two-factor') || lowerMessage.includes('2fa')) {
    return {
      title: '🔒 2FA Required',
      description: 'Two-factor authentication must be enabled before you can withdraw funds. Set it up in your security settings.',
      variant: 'info',
      icon: 'shield',
    };
  }

  if (lowerMessage.includes('withdrawal exceeds')) {
    return {
      title: '💸 Amount Too High',
      description: message + ' Please enter a lower amount.',
      variant: 'warning',
      icon: 'dollar-sign',
    };
  }

  // Validation errors
  if (lowerMessage.includes('invalid') || lowerMessage.includes('must be') || lowerMessage.includes('required')) {
    if (lowerMessage.includes('address')) {
      return {
        title: '📍 Invalid Address',
        description: 'Please enter a valid Polygon wallet address starting with "0x".',
        variant: 'warning',
        icon: 'map-pin',
      };
    }
    if (lowerMessage.includes('amount') || lowerMessage.includes('value')) {
      return {
        title: '🔢 Invalid Amount',
        description: 'Please enter a valid amount greater than 0.',
        variant: 'warning',
        icon: 'hash',
      };
    }
    return {
      title: '⚠️ Invalid Input',
      description: message,
      variant: 'warning',
      icon: 'alert-triangle',
    };
  }

  // Event/Market errors
  if (lowerMessage.includes('event not found') || lowerMessage.includes('market not found')) {
    return {
      title: '🔍 Market Not Found',
      description: 'This market doesn\'t exist or has been removed.',
      variant: 'destructive',
      icon: 'search-x',
    };
  }

  if (lowerMessage.includes('event ended') || lowerMessage.includes('market closed')) {
    return {
      title: '🏁 Market Closed',
      description: 'This market has ended and is no longer accepting trades.',
      variant: 'info',
      icon: 'flag',
    };
  }

  // Network/Connection errors
  if (lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('timeout')) {
    return {
      title: '🌐 Connection Error',
      description: 'Unable to connect to the server. Please check your internet connection and try again.',
      variant: 'destructive',
      icon: 'wifi-off',
    };
  }

  if (lowerMessage.includes('server error') || lowerMessage.includes('internal error')) {
    return {
      title: '🔧 Server Error',
      description: 'Something went wrong on our end. Please try again in a moment.',
      variant: 'destructive',
      icon: 'server',
    };
  }

  // Database/Query errors
  if (lowerMessage.includes('database') || lowerMessage.includes('query')) {
    return {
      title: '💾 Database Error',
      description: 'Unable to process your request. Please try again.',
      variant: 'destructive',
      icon: 'database',
    };
  }

  // Success messages (for completeness)
  if (lowerMessage.includes('success')) {
    return {
      title: '✅ Success',
      description: message,
      variant: 'success',
      icon: 'check-circle',
    };
  }

  // Default fallback
  return {
    title: 'Error',
    description: message || 'An unexpected error occurred. Please try again.',
    variant: 'destructive',
    icon: 'alert-circle',
  };
}

// Helper function for specific error types
export function getBalanceError(available: number, required: number): UserFriendlyError {
  return {
    title: '💰 Insufficient Balance',
    description: `You have $${available.toFixed(2)} available but need $${required.toFixed(2)}. Please deposit $${(required - available).toFixed(2)} more or reduce your bet amount.`,
    variant: 'warning',
    icon: 'wallet',
  };
}

export function getMinimumBetError(minimum: number): UserFriendlyError {
  return {
    title: '📊 Bet Too Small',
    description: `Minimum bet is $${minimum.toFixed(2)}. Please increase your amount.`,
    variant: 'warning',
    icon: 'trending-up',
  };
}

export function getMaximumBetError(maximum: number): UserFriendlyError {
  return {
    title: '📊 Bet Too Large',
    description: `Maximum bet is $${maximum.toFixed(2)}. Please reduce your amount.`,
    variant: 'warning',
    icon: 'trending-down',
  };
}

