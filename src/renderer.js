export class Renderer {
  static extractData(card) {
    const content = card.lines.join('\n');

    switch (card.type) {
      case 'choice': {
        const question = card.lines[0] || '';
        const options = [];
        for (let i = 1; i < card.lines.length; i++) {
          const m = card.lines[i].match(/^- ([A-D])\.\s*(.+)$/);
          if (m) options.push({ id: m[1], label: m[2] });
        }
        return { question, options };
      }

      case 'tip': {
        const clean = card.lines.map(l => l.replace(/^>\s*/, '')).join('\n');
        const firstLine = card.lines[0]?.replace(/^>\s*/, '').replace(/^[^\w]*\s*/, '') || '';
        return { title: firstLine, body: clean };
      }

      case 'input': {
        const title = card.lines[0] || '';
        const placeholder = (card.lines[1] || '').replace(/^\*\(|\)\*$/g, '');
        return { title, placeholder };
      }

      case 'progress': {
        const line = card.lines[0] || '';
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
        const rows = card.lines.filter(l => l.startsWith('|'));
        const title = rows[0]?.split('|')[1]?.trim() || '';
        const value = rows[0]?.split('|')[2]?.trim() || '';
        const subtitle = rows[1]?.split('|')[2]?.trim() || '';
        return { title, value, subtitle };
      }

      case 'confirm': {
        const titleMatch = content.match(/\*\*(.+?)\*\*/);
        const desc = card.lines[1] || '';
        const btnMatch = content.match(/>\s*(.+?)\s*\|\s*(.+)/);
        return {
          title: titleMatch?.[1] || '',
          description: desc,
          confirmLabel: btnMatch?.[1]?.trim() || '确认',
          cancelLabel: btnMatch?.[2]?.trim() || '取消'
        };
      }

      case 'chart': {
        const tableRows = card.lines.filter(l => l.startsWith('|') && !l.includes('---'));
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