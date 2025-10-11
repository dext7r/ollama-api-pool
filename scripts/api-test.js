#!/usr/bin/env node

/**
 * API 接口测试脚本
 * 用于测试 Ollama API Pool 的核心功能
 */

import { writeFileSync } from 'fs';

const API_BASE_URL = process.env.API_BASE_URL || 'https://ollama-api-pool.h7ml.workers.dev';
const API_TOKEN = process.env.API_TOKEN || '';

// 测试结果统计
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * 日志工具
 */
function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m'
  };
  const color = colors[type] || colors.info;
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * 执行单个测试
 */
async function runTest(name, testFn) {
  results.total++;
  const startTime = Date.now();

  try {
    log(`\n🧪 测试: ${name}`, 'info');
    await testFn();
    const duration = Date.now() - startTime;

    results.passed++;
    results.tests.push({
      name,
      status: 'passed',
      duration,
      error: null
    });

    log(`✓ 通过 (${duration}ms)`, 'success');
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;

    results.failed++;
    results.tests.push({
      name,
      status: 'failed',
      duration,
      error: error.message
    });

    log(`✗ 失败: ${error.message}`, 'error');
    return false;
  }
}

/**
 * 测试 1: 获取模型列表
 */
async function testGetModels() {
  const response = await fetch(`${API_BASE_URL}/v1/models`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.object || data.object !== 'list') {
    throw new Error('响应格式错误：缺少 object 字段或值不为 list');
  }

  if (!Array.isArray(data.data)) {
    throw new Error('响应格式错误：data 字段不是数组');
  }

  if (data.data.length === 0) {
    throw new Error('模型列表为空');
  }

  log(`  └─ 获取到 ${data.data.length} 个模型`, 'info');

  // 验证第一个模型的结构
  const firstModel = data.data[0];
  const requiredFields = ['id', 'object', 'created', 'owned_by'];

  for (const field of requiredFields) {
    if (!(field in firstModel)) {
      throw new Error(`模型对象缺少必需字段: ${field}`);
    }
  }

  log(`  └─ 模型示例: ${firstModel.id}`, 'info');
}

/**
 * 测试 2: 获取测试模板
 */
async function testGetTemplates() {
  const response = await fetch(`${API_BASE_URL}/api/test-templates`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-store'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.templates || !Array.isArray(data.templates)) {
    throw new Error('响应格式错误：缺少 templates 数组');
  }

  if (data.templates.length === 0) {
    throw new Error('测试模板列表为空');
  }

  log(`  └─ 获取到 ${data.templates.length} 个测试模板`, 'info');

  // 验证第一个模板的结构
  const firstTemplate = data.templates[0];
  const requiredFields = ['id', 'label', 'description', 'systemPrompt', 'userMessage', 'temperature'];

  for (const field of requiredFields) {
    if (!(field in firstTemplate)) {
      throw new Error(`模板对象缺少必需字段: ${field}`);
    }
  }

  log(`  └─ 模板示例: ${firstTemplate.label}`, 'info');
}

/**
 * 测试 3: Chat Completion (非流式)
 */
async function testChatCompletion() {
  if (!API_TOKEN) {
    throw new Error('未设置 API_TOKEN 环境变量，跳过需要授权的测试');
  }

  // 首先获取可用模型
  const modelsResponse = await fetch(`${API_BASE_URL}/v1/models`, {
    method: 'GET'
  });

  if (!modelsResponse.ok) {
    throw new Error('无法获取模型列表');
  }

  const modelsData = await modelsResponse.json();

  if (!modelsData.data || modelsData.data.length === 0) {
    throw new Error('没有可用的模型');
  }

  const modelId = modelsData.data[0].id;
  log(`  └─ 使用模型: ${modelId}`, 'info');

  const requestBody = {
    model: modelId,
    messages: [
      {
        role: 'system',
        content: '你是一个友好的助手。'
      },
      {
        role: 'user',
        content: '你好，请用一句话介绍你自己。'
      }
    ],
    temperature: 0.7,
    stream: false
  };

  const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  // 验证响应结构
  if (!data.choices || !Array.isArray(data.choices)) {
    throw new Error('响应格式错误：缺少 choices 数组');
  }

  if (data.choices.length === 0) {
    throw new Error('响应中没有选择项');
  }

  const firstChoice = data.choices[0];

  if (!firstChoice.message || !firstChoice.message.content) {
    throw new Error('响应格式错误：缺少消息内容');
  }

  if (!data.usage) {
    throw new Error('响应格式错误：缺少 usage 信息');
  }

  log(`  └─ 响应长度: ${firstChoice.message.content.length} 字符`, 'info');
  log(`  └─ Token 使用: ${data.usage.total_tokens}`, 'info');
  log(`  └─ 响应预览: ${firstChoice.message.content.substring(0, 50)}...`, 'info');
}

/**
 * 测试 4: Chat Completion (流式)
 */
async function testChatCompletionStream() {
  if (!API_TOKEN) {
    throw new Error('未设置 API_TOKEN 环境变量，跳过需要授权的测试');
  }

  // 获取可用模型
  const modelsResponse = await fetch(`${API_BASE_URL}/v1/models`);
  if (!modelsResponse.ok) {
    throw new Error('无法获取模型列表');
  }

  const modelsData = await modelsResponse.json();
  if (!modelsData.data || modelsData.data.length === 0) {
    throw new Error('没有可用的模型');
  }

  const modelId = modelsData.data[0].id;
  log(`  └─ 使用模型: ${modelId}`, 'info');

  const requestBody = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: '请数从 1 到 5'
      }
    ],
    temperature: 0.3,
    stream: true
  };

  const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('响应没有 body stream');
  }

  // 读取流式响应
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let chunks = 0;
  let content = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          if (data === '[DONE]') {
            continue;
          }

          try {
            const json = JSON.parse(data);
            if (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) {
              content += json.choices[0].delta.content;
            }
            chunks++;
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (chunks === 0) {
    throw new Error('没有接收到任何流式数据块');
  }

  log(`  └─ 接收到 ${chunks} 个数据块`, 'info');
  log(`  └─ 内容长度: ${content.length} 字符`, 'info');
}

/**
 * 测试 5: 错误处理 - 无效的 Token
 */
async function testInvalidToken() {
  const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer invalid-token-123',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }]
    })
  });

  if (response.ok) {
    throw new Error('应该返回 401 错误，但请求成功了');
  }

  if (response.status !== 401) {
    throw new Error(`期望 401 状态码，实际得到 ${response.status}`);
  }

  log(`  └─ 正确返回 401 未授权错误`, 'info');
}

/**
 * 生成测试报告
 */
function generateReport() {
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(2) : '0.00';

  log('\n' + '='.repeat(60), 'info');
  log('📊 测试报告', 'info');
  log('='.repeat(60), 'info');

  log(`\n总测试数: ${results.total}`, 'info');
  log(`通过: ${results.passed}`, 'success');
  log(`失败: ${results.failed}`, results.failed > 0 ? 'error' : 'info');
  log(`通过率: ${passRate}%`, results.failed === 0 ? 'success' : 'warn');

  log('\n详细结果:', 'info');
  results.tests.forEach((test, index) => {
    const icon = test.status === 'passed' ? '✓' : '✗';
    const statusColor = test.status === 'passed' ? 'success' : 'error';
    log(`  ${index + 1}. ${icon} ${test.name} (${test.duration}ms)`, statusColor);

    if (test.error) {
      log(`     错误: ${test.error}`, 'error');
    }
  });

  log('\n' + '='.repeat(60) + '\n', 'info');

  return results;
}

/**
 * 生成 GitHub Comment 格式的报告
 */
function generateGitHubComment() {
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(2) : '0.00';
  const icon = results.failed === 0 ? '✅' : '⚠️';

  let comment = `## ${icon} API 接口测试报告\n\n`;
  comment += `**测试时间**: ${new Date().toISOString()}\n`;
  comment += `**API 地址**: \`${API_BASE_URL}\`\n\n`;

  comment += `### 📊 测试统计\n\n`;
  comment += `| 指标 | 数值 |\n`;
  comment += `|------|------|\n`;
  comment += `| 总测试数 | ${results.total} |\n`;
  comment += `| ✅ 通过 | ${results.passed} |\n`;
  comment += `| ❌ 失败 | ${results.failed} |\n`;
  comment += `| 📈 通过率 | ${passRate}% |\n\n`;

  comment += `### 📋 测试详情\n\n`;

  results.tests.forEach((test, index) => {
    const icon = test.status === 'passed' ? '✅' : '❌';
    comment += `#### ${index + 1}. ${icon} ${test.name}\n\n`;
    comment += `- **状态**: ${test.status === 'passed' ? '通过' : '失败'}\n`;
    comment += `- **耗时**: ${test.duration}ms\n`;

    if (test.error) {
      comment += `- **错误信息**: \n\`\`\`\n${test.error}\n\`\`\`\n`;
    }

    comment += '\n';
  });

  if (results.failed > 0) {
    comment += `\n---\n\n⚠️ **注意**: 测试未完全通过，请检查失败的测试项。\n`;
  } else {
    comment += `\n---\n\n✨ **恭喜**: 所有测试均已通过！\n`;
  }

  return comment;
}

/**
 * 主函数
 */
async function main() {
  log('\n🚀 开始 API 接口测试\n', 'info');
  log(`API 地址: ${API_BASE_URL}`, 'info');
  log(`Token 状态: ${API_TOKEN ? '✓ 已设置' : '✗ 未设置（将跳过需要授权的测试）'}`, 'info');

  // 执行测试
  await runTest('获取模型列表', testGetModels);
  await runTest('获取测试模板', testGetTemplates);
  await runTest('Chat Completion (非流式)', testChatCompletion);
  await runTest('Chat Completion (流式)', testChatCompletionStream);
  await runTest('错误处理 - 无效 Token', testInvalidToken);

  // 生成报告
  const report = generateReport();

  // 生成 GitHub Comment
  const githubComment = generateGitHubComment();

  // 输出 GitHub Comment 到文件（供 GitHub Action 使用）
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync('test-report.md', githubComment);
    log('\n✓ 测试报告已保存到 test-report.md', 'success');
  }

  // 退出码
  process.exit(report.failed > 0 ? 1 : 0);
}

// 运行测试
main().catch(error => {
  log(`\n❌ 测试执行失败: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});
