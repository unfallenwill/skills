/**
 * CNB Issue API Client
 * 使用 swagger-client 操作 CNB 平台的 Issue
 *
 * 使用前请确保安装: npm install swagger-client
 *
 * 环境变量:
 *   CNB_TOKEN - CNB API 访问令牌 (必需)
 */

const SwaggerClient = require('swagger-client');

const SWAGGER_URL = 'https://api.cnb.cool/swagger.json';

let clientInstance = null;

async function getClient() {
  if (clientInstance) return clientInstance;

  const token = process.env.CNB_TOKEN;
  if (!token) {
    throw new Error('请设置环境变量 CNB_TOKEN');
  }

  clientInstance = await SwaggerClient({
    url: SWAGGER_URL,
    authorizations: {
      BearerAuth: token.startsWith('Bearer ') ? token : `Bearer ${token}`
    }
  });

  return clientInstance;
}

// ============ Issue 操作 ============

/**
 * 列出仓库的 Issues
 * @param {string} repo - 仓库路径
 * @param {object} params - 查询参数
 */
async function listIssues(repo, params = {}) {
  const client = await getClient();
  const result = await client.apis.Issues.ListIssues({
    repo: repo,
    ...params
  });
  return result.body || result.data;
}

/**
 * 获取单个 Issue 详情
 * @param {string} repo - 仓库路径
 * @param {number} number - Issue 编号
 */
async function getIssue(repo, number) {
  const client = await getClient();
  const result = await client.apis.Issues.GetIssue({
    repo: repo,
    number: number
  });
  return result.body || result.data;
}

/**
 * 创建 Issue
 * @param {string} repo - 仓库路径
 * @param {object} issue - Issue 内容
 * @param {string} issue.title - 标题
 * @param {string} issue.body - 内容
 * @param {string[]} issue.labels - 标签
 * @param {string[]} issue.assignees - 处理人
 */
async function createIssue(repo, issue) {
  const client = await getClient();
  const result = await client.apis.Issues.CreateIssue({
    repo: repo,
    post_issue_form: {
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels || [],
      assignees: issue.assignees || []
    }
  });
  return result.body || result.data;
}

/**
 * 更新 Issue
 * @param {string} repo - 仓库路径
 * @param {number} number - Issue 编号
 * @param {object} updates - 更新内容
 */
async function updateIssue(repo, number, updates) {
  const client = await getClient();
  const result = await client.apis.Issues.UpdateIssue({
    repo: repo,
    number: number,
    patch_issue_form: updates
  });
  return result.body || result.data;
}

// ============ Assignee 操作 ============

/**
 * 获取 Issue 的处理人列表
 */
async function getAssignees(repo, number) {
  const client = await getClient();
  const result = await client.apis.Issues.ListIssueAssignees({
    repo: repo,
    number: number
  });
  return result.body || result.data;
}

/**
 * 添加 Issue 处理人
 * @param {string} repo - 仓库路径
 * @param {number} number - Issue 编号
 * @param {string[]} assignees - 处理人列表
 */
async function addAssignees(repo, number, assignees) {
  const client = await getClient();
  const result = await client.apis.Issues.PostIssueAssignees({
    repo: repo,
    number: number,
    post_issue_assignees_form: { assignees }
  });
  return result.body || result.data;
}

/**
 * 移除 Issue 处理人
 */
async function removeAssignees(repo, number, assignees) {
  const client = await getClient();
  const result = await client.apis.Issues.DeleteIssueAssignees({
    repo: repo,
    number: number,
    delete_issue_assignees_form: { assignees }
  });
  return result.body || result.data;
}

// ============ Label 操作 ============

/**
 * 获取 Issue 的标签列表
 */
async function getLabels(repo, number) {
  const client = await getClient();
  const result = await client.apis.Issues.ListIssueLabels({
    repo: repo,
    number: number
  });
  return result.body || result.data;
}

/**
 * 添加 Issue 标签
 */
async function addLabels(repo, number, labels) {
  const client = await getClient();
  const result = await client.apis.Issues.PostIssueLabels({
    repo: repo,
    number: number,
    post_issue_labels_form: { labels }
  });
  return result.body || result.data;
}

/**
 * 设置 Issue 标签 (替换现有标签)
 */
async function setLabels(repo, number, labels) {
  const client = await getClient();
  const result = await client.apis.Issues.PutIssueLabels({
    repo: repo,
    number: number,
    put_issue_labels_form: { labels }
  });
  return result.body || result.data;
}

/**
 * 移除 Issue 的所有标签
 */
async function clearLabels(repo, number) {
  const client = await getClient();
  const result = await client.apis.Issues.DeleteIssueLabels({
    repo: repo,
    number: number
  });
  return result.body || result.data;
}

/**
 * 移除 Issue 的指定标签
 */
async function removeLabel(repo, number, name) {
  const client = await getClient();
  const result = await client.apis.Issues.DeleteIssueLabel({
    repo: repo,
    number: number,
    name: name
  });
  return result.body || result.data;
}

// ============ Comment 操作 ============

/**
 * 获取 Issue 评论列表
 */
async function getComments(repo, number, params = {}) {
  const client = await getClient();
  const result = await client.apis.Issues.ListIssueComments({
    repo: repo,
    number: number,
    ...params
  });
  return result.body || result.data;
}

/**
 * 创建 Issue 评论
 */
async function createComment(repo, number, body) {
  const client = await getClient();
  const result = await client.apis.Issues.PostIssueComment({
    repo: repo,
    number: number,
    post_issue_comment_form: { body }
  });
  return result.body || result.data;
}

/**
 * 获取单个评论
 */
async function getComment(repo, number, commentId) {
  const client = await getClient();
  const result = await client.apis.Issues.GetIssueComment({
    repo: repo,
    number: number,
    comment_id: commentId
  });
  return result.body || result.data;
}

/**
 * 更新评论
 */
async function updateComment(repo, number, commentId, body) {
  const client = await getClient();
  const result = await client.apis.Issues.PatchIssueComment({
    repo: repo,
    number: number,
    comment_id: commentId,
    patch_issue_comment_form: { body }
  });
  return result.body || result.data;
}

// ============ Property 操作 ============

/**
 * 批量更新 Issue 自定义属性
 */
async function updateProperties(repo, number, properties) {
  const client = await getClient();
  const result = await client.apis.Issues.UpdateIssueProperties({
    repo: repo,
    number: number,
    issue_properties_form: { properties }
  });
  return result.body || result.data;
}

// ============ CLI 接口 ============

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    let result;

    switch (command) {
      case 'list':
        result = await listIssues(args[0], JSON.parse(args[1] || '{}'));
        break;

      case 'get':
        result = await getIssue(args[0], parseInt(args[1]));
        break;

      case 'create':
        result = await createIssue(args[0], JSON.parse(args[1]));
        break;

      case 'update':
        result = await updateIssue(args[0], parseInt(args[1]), JSON.parse(args[2]));
        break;

      case 'add-labels':
        result = await addLabels(args[0], parseInt(args[1]), JSON.parse(args[2]));
        break;

      case 'set-labels':
        result = await setLabels(args[0], parseInt(args[1]), JSON.parse(args[2]));
        break;

      case 'remove-label':
        result = await removeLabel(args[0], parseInt(args[1]), args[2]);
        break;

      case 'add-assignees':
        result = await addAssignees(args[0], parseInt(args[1]), JSON.parse(args[2]));
        break;

      case 'remove-assignees':
        result = await removeAssignees(args[0], parseInt(args[1]), JSON.parse(args[2]));
        break;

      case 'add-comment':
        result = await createComment(args[0], parseInt(args[1]), args[2]);
        break;

      case 'list-comments':
        result = await getComments(args[0], parseInt(args[1]));
        break;

      default:
        console.log(`
CNB Issue 操作工具

用法: node cnb-client.js <command> [args...]

命令:
  list <repo> [query]           - 列出 Issues
  get <repo> <number>           - 获取 Issue 详情
  create <repo> <json>          - 创建 Issue
  update <repo> <number> <json> - 更新 Issue
  add-labels <repo> <number> <labels>  - 添加标签
  set-labels <repo> <number> <labels>  - 设置标签
  remove-label <repo> <number> <name>  - 移除标签
  add-assignees <repo> <number> <users> - 添加处理人
  remove-assignees <repo> <number> <users> - 移除处理人
  add-comment <repo> <number> <body> - 添加评论
  list-comments <repo> <number> - 列出评论

环境变量:
  CNB_TOKEN - CNB API 访问令牌

示例:
  CNB_TOKEN=xxx node cnb-client.js list owner/repo
  CNB_TOKEN=xxx node cnb-client.js create owner/repo '{"title":"Bug report","body":"描述"}'
  CNB_TOKEN=xxx node cnb-client.js add-comment owner/repo 123 "这是评论内容"
        `);
        process.exit(0);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.body || error.response.data);
    }
    process.exit(1);
  }
}

// 导出函数供模块使用
module.exports = {
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  getAssignees,
  addAssignees,
  removeAssignees,
  getLabels,
  addLabels,
  setLabels,
  clearLabels,
  removeLabel,
  getComments,
  createComment,
  getComment,
  updateComment,
  updateProperties
};

// 仅在直接运行时执行 CLI
if (require.main === module) {
  main();
}
