import { tokenInfoService } from '../../../services/tokens/TokenInfoService.js';
import { networkState } from '../../../services/networkState.js';
import { ErrorHandler } from '../../../core/errors/index.js';

export class ScanHandler {
  constructor(bot) {
    this.bot = bot;
  }

  async handleTokenScan(chatId, address, userInfo) {
    const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);
    const loadingMsg = await this.bot.sendMessage(
      chatId, 
      `😼 Scanning token on ${networkState.getNetworkDisplay(currentNetwork)}`
    );
    
    try {
      // Get token info from TokenInfoService
      const tokenInfo = await tokenInfoService.getTokenInfo(currentNetwork, address);
      if (!tokenInfo) {
        throw new Error('Token not found');
      }

      // Get additional analysis data
      const analysis = await tokenInfoService.getTokenAnalysis(currentNetwork, address);

      // Format message with token info and analysis
      const message = this.formatAnalysisMessage(tokenInfo, analysis);

      await this.bot.deleteMessage(chatId, loadingMsg.message_id);

      const keyboard = {
        inline_keyboard: [
          [{ text: '🔄 Scan Another', callback_data: 'scan_input' }],
          [{ text: '🔄 Switch Network', callback_data: 'switch_network' }],
          [{ text: '↩️ Back to Menu', callback_data: 'back_to_menu' }]
        ]
      };

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });

      return true;
    } catch (error) {
      if (loadingMsg) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      }
      throw error;
    }
  }

  formatAnalysisMessage(tokenInfo, analysis) {
    return `
*Token Analysis* 🔍

*Token Info:*
• Name: ${tokenInfo.name || 'Unknown'}
• Symbol: ${tokenInfo.symbol || 'Unknown'}
${tokenInfo.logo ? '• Logo: [View]('+tokenInfo.logo+')' : ''}

*Contract Address:*
\`${tokenInfo.address}\`

*Security Score:*
• Total Score: ${analysis.score?.total || 0}/100
• Information: ${analysis.score?.information || 0}/100
• Pool: ${analysis.score?.pool || 0}/100
• Holders: ${analysis.score?.holders || 0}/100

*Security Audit:*
• Open Source: ${this.formatAuditValue(analysis.audit?.isOpenSource)}
• Honeypot Risk: ${this.formatAuditValue(analysis.audit?.isHoneypot)}
• Mintable: ${this.formatAuditValue(analysis.audit?.isMintable)}
• Buy Tax: ${this.formatTaxValue(analysis.audit?.buyTax)}
• Sell Tax: ${this.formatTaxValue(analysis.audit?.sellTax)}
• Contract Renounced: ${this.formatAuditValue(analysis.audit?.isContractRenounced)}

*Price Info (24h):*
• Current: $${this.formatNumber(analysis.price?.current)}
• Change: ${this.formatNumber(analysis.price?.change24h)}%
• Volume: $${this.formatNumber(analysis.volume24h)}
• Buys/Sells: ${analysis.trades?.buys24h || 0}/${analysis.trades?.sells24h || 0}

*Liquidity Info:*
• Total Value: $${this.formatNumber(analysis.liquidity?.total)}
• Token Reserve: ${this.formatNumber(analysis.liquidity?.tokenReserve)}
• Pair Reserve: ${this.formatNumber(analysis.liquidity?.pairReserve)}

*Pool Info:*
• Exchange: ${analysis.pool?.exchange || 'Unknown'}
• Created: ${new Date(analysis.pool?.createdAt).toLocaleString()}
• Fee: ${analysis.pool?.fee || 0}%

*Social Links:*
${this.formatSocialLinks(tokenInfo.social)}

*View on Explorer:*
[Open in Explorer](${tokenInfo.explorerUrl})

_Last Updated: ${new Date().toLocaleString()}_
`.trim();
  }

  formatAuditValue(value) {
    if (!value) return '❓';
    return value.toLowerCase() === 'true' ? '✅' : '❌';
  }

  formatTaxValue(tax) {
    if (!tax) return 'N/A';
    return `${tax.min || 0}-${tax.max || 0}%`;
  }

  formatNumber(num) {
    if (!num) return '0.00';
    return Number(num).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  formatSocialLinks(social) {
    if (!social) return 'No social links available';
    
    const links = [];
    if (social.twitter) links.push(`• [Twitter](${social.twitter})`);
    if (social.telegram) links.push(`• [Telegram](${social.telegram})`);
    if (social.website) links.push(`• [Website](${social.website})`);
    
    return links.length > 0 ? links.join('\n') : 'No social links available';
  }
}