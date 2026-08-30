const fs = require('fs');
const path = require('path');

const lessonsDir = path.join(__dirname, '..', 'backend', 'src', 'main', 'resources', 'content', 'lessons');
let fixed = 0;
let skipped = 0;

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const fm = fmMatch[1];
      if (fm.includes('summary:')) {
        skipped++;
        continue;
      }

      // Extract title
      const titleMatch = fm.match(/^title:\s*(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Extract first paragraph from body
      const body = content.substring(fmMatch[0].length).trim();
      const lines = body.split('\n');
      let summary = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 30 && !trimmed.startsWith('#') && !trimmed.startsWith('```') && !trimmed.startsWith('|') && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
          summary = trimmed.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*>`\-|]/g, '').trim();
          if (summary.length > 150) summary = summary.substring(0, 147) + '...';
          break;
        }
      }
      if (!summary) summary = title;

      // Add summary after title line
      const newFm = fm + '\nsummary: ' + summary;
      const newContent = content.replace(fmMatch[0], '---\n' + newFm + '\n---');
      fs.writeFileSync(fullPath, newContent, 'utf8');
      fixed++;
    }
  }
}

processDir(lessonsDir);
console.log('Fixed: ' + fixed + ', Already had summary: ' + skipped);
