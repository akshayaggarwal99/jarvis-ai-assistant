// Minimal MCP client that searches local company memory
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface MCPSearchResult {
  text: string;
}

// Store memory in user's home directory
const getMemoryPath = () => {
  const jarvisDir = process.env.JARVIS_DATA_DIR || path.join(os.homedir(), '.jarvis');
  if (!fs.existsSync(jarvisDir)) {
    fs.mkdirSync(jarvisDir, { recursive: true });
  }
  return path.join(jarvisDir, 'company-memory.json');
};

export class MCPClient {
  private memoryPath = getMemoryPath();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async addMemory(text: string): Promise<void> {
    // Add new memory to local JSON
    let memory = [];
    if (fs.existsSync(this.memoryPath)) {
      memory = JSON.parse(fs.readFileSync(this.memoryPath, 'utf8'));
    }
    memory.push({ name: 'transcript', content: text, source: 'conversation' });
    fs.writeFileSync(this.memoryPath, JSON.stringify(memory, null, 2));
  }
  
  async searchContext(query: string, count: number): Promise<MCPSearchResult[]> {
    if (!fs.existsSync(this.memoryPath)) {
      console.log('Memory file not found at:', this.memoryPath);
      return [];
    }
    const memory = JSON.parse(fs.readFileSync(this.memoryPath, 'utf8'));
    // Simple keyword search in content
    const queryWords = query.toLowerCase().split(' ');
    const results = memory
      .filter((item: any) => queryWords.some(word => item.content.toLowerCase().includes(word)))
      .slice(0, count)
      .map((item: any) => ({ text: item.content }));
    console.log('Found', results.length, 'RAG results for query:', query);
    return results;
  }
}
