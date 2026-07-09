/**
 * XIUI 渲染器基类
 * 继承此类实现自定义渲染逻辑
 */
export class Renderer {
  /** 卡片开始时调用，用于创建骨架屏 */
  onCardStart(type, id) {}

  /** 卡片内容逐行到达时调用 */
  onCardLine(card, line) {}

  /** 卡片结束时调用，用于渲染完整卡片 */
  onCardEnd(card, lines) {}

  /** 普通 Markdown 行 */
  onMarkdownLine(line) {}

  /** 检测到 submit 卡片 */
  onSubmitCard(card) {}

  /** 字符级别回调（流式传输场景） */
  onChar(char, lineBuffer, inCard) {}

  /**
   * 从 Markdown 内容中提取卡片结构化数据
   */
  static extractData(card, lines) {
    const content = lines.join('\n');

    switch (card.type) {
      case 'choice': {
        const question = lines[0] || '';
        const options = [];
        for (let i = 1; i < lines.length; i++) {
          const m = lines[i].match(/^- ([A-D])\.\s*(.+)$/);
          if (m) options.push({ id: m[1], label: m[2] });
        }
        return { question, options };
      }

      case 'tip': {
        const clean = lines.map(l => l.replace(/^>\s*/, '')).join('\n');
        const firstLine = lines[0]?.replace(/^>\s*/, '').replace(/^[^\w]*\s*/, '') || '';
        return { title: firstLine, body: clean };
      }

      case 'input': {
        const title = lines[0] || '';
        const placeholder = (lines[1] || '').replace(/^\*\(|\)\*$/g, '');
        return { title, placeholder };
      }

      case 'progress': {
        const line = lines[0] || '';
        const titleMatch = line.match(/\*\*(.+?)\*\*/);
        const progressMatch = line.match(/(\d+)%/);
        const labelMatch = line.match(/([\d]+\/[\d]+)/);
        return {
          title: titleMatch?.[1] || '',
          progress: progressMatch ? parseInt(progressMatch[1]) / 100 : 0,
          label: labelMatch?.[1] || ''
        };
      }

      case 'summary': {
        const rows = lines.filter(l => l.startsWith('|'));
        const title = rows[0]?.split('|')[1]?.trim() || '';
        const value = rows[0]?.split('|')[2]?.trim() || '';
        const subtitle = rows[1]?.split('|')[2]?.trim() || '';
        return { title, value, subtitle };
      }

      case 'confirm': {
        const titleMatch = content.match(/\*\*(.+?)\*\*/);
        const desc = lines[1] || '';
        const btnMatch = content.match(/>\s*(.+?)\s*\|\s*(.+)/);
        return {
          title: titleMatch?.[1] || '',
          description: desc,
          confirmLabel: btnMatch?.[1]?.trim() || '确认',
          cancelLabel: btnMatch?.[2]?.trim() || '取消'
        };
      }

      case 'chart': {
        const tableRows = lines.filter(l => l.startsWith('|') && !l.includes('---'));
        const labels = tableRows[0]?.split('|').filter(Boolean).map(s => s.trim()) || [];
        const data = tableRows[1]?.split('|').filter(Boolean).map(s => parseFloat(s.trim())) || [];
        const unitMatch = content.match(/\*\((.+)\)\*/);
        return { labels, data, unit: unitMatch?.[1] || '' };
      }

      default:
        return { content };
    }
  }
}