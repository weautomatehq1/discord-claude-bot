const { spawn } = require('child_process')
const path = require('path')

const CLAUDE = process.env.CLAUDE_PATH ?? 'claude'
const IFLEET_DIR = process.env.IFLEET_DIR ?? path.join(process.env.HOME, 'dev/ai-products/IFleet')
const IFLEET_OWNER = process.env.IFLEET_OWNER ?? 'weautomatehq1'
const IFLEET_REPO = process.env.IFLEET_REPO ?? 'IFleet'
const PLAN_TIMEOUT_MS = Number(process.env.IFLEET_PLAN_TIMEOUT_MS ?? 120000)

const pendingApprovals = new Map()

const REPO_MAP = `~/dev/ai-products/IFleet/src/
  orchestrator/   — sprint runtime
  queue/          — GitHub issue queue
  workers/        — claude/codex CLI adapters
  pipeline/       — Architect→Editor→Reviewer
  verify/         — pre-PR gate
  observability/  — Discord notifications`

function buildPlanPrompt(request) {
  return `You are the IFleet planning agent. Convert the user request into a concise, actionable plan that will become a GitHub issue for an autonomous coding agent.

Codebase root: ${IFLEET_DIR}
Repo map:
${REPO_MAP}

User request:
${request}

Output EXACTLY this format, no preamble, no markdown fences:

TITLE: <short imperative title, max 80 chars>
DESCRIPTION: <2-3 sentences of context and motivation>
ACCEPTANCE_CRITERIA:
- <criterion 1>
- <criterion 2>
- <criterion 3>
FILES_LIKELY_TOUCHED: <comma-separated relative paths from repo root>

Keep the entire response under 1500 characters. Do not include code, only the plan.`
}

function runClaudePlan(request) {
  return new Promise((resolve, reject) => {
    const prompt = buildPlanPrompt(request)
    let output = ''
    let err = ''

    const proc = spawn(CLAUDE, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: IFLEET_DIR,
      env: { ...process.env }
    })

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`claude -p timed out after ${PLAN_TIMEOUT_MS}ms`))
    }, PLAN_TIMEOUT_MS)

    proc.stdout.on('data', (d) => { output += d.toString() })
    proc.stderr.on('data', (d) => { err += d.toString() })

    proc.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 && !output.trim()) {
        reject(new Error(`claude -p exited ${code}: ${err.trim()}`))
        return
      }
      resolve(output.trim())
    })
  })
}

function parsePlan(raw) {
  const titleMatch = raw.match(/^TITLE:\s*(.+)$/m)
  const descMatch = raw.match(/^DESCRIPTION:\s*([\s\S]*?)(?=^ACCEPTANCE_CRITERIA:|\z)/m)
  const acMatch = raw.match(/^ACCEPTANCE_CRITERIA:\s*([\s\S]*?)(?=^FILES_LIKELY_TOUCHED:|\z)/m)
  const filesMatch = raw.match(/^FILES_LIKELY_TOUCHED:\s*(.+)$/m)

  const title = (titleMatch?.[1] ?? 'Untitled task').trim().slice(0, 80)
  const description = (descMatch?.[1] ?? '').trim()
  const criteria = (acMatch?.[1] ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
  const files = (filesMatch?.[1] ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)

  return { title, description, criteria, files }
}

function formatPlanMessage({ title, description, criteria, files }) {
  const criteriaBlock = criteria.length
    ? criteria.map((c) => `• ${c}`).join('\n')
    : '• (none specified)'
  const filesBlock = files.length
    ? files.map((f) => `\`${f}\``).join(', ')
    : '_(to be determined)_'

  const msg = `🤖 **Plan: ${title}**
${description}

**Acceptance criteria:**
${criteriaBlock}

**Files:** ${filesBlock}

React ✅ to approve and start IFleet.`

  return msg.length > 1990 ? msg.slice(0, 1987) + '...' : msg
}

function buildIssueBody({ description, criteria, files, request }) {
  const criteriaBlock = criteria.length
    ? criteria.map((c) => `- [ ] ${c}`).join('\n')
    : '- [ ] (to be defined)'
  const filesBlock = files.length ? files.map((f) => `- \`${f}\``).join('\n') : '- _(to be determined)_'

  return `## Context
${description}

## Acceptance criteria
${criteriaBlock}

## Files likely touched
${filesBlock}

---
**Original request:** ${request}
_Created via IFleet Discord bot._`
}

async function handleIFleetMention(message, client) {
  const request = message.content
    .replace(/<@!?\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .trim()

  if (!request) {
    await message.reply('Mention me with a request, e.g. `@ifleet find dead code in workers`.')
    return
  }

  const thinking = await message.reply('_planning..._')

  try {
    const raw = await runClaudePlan(request)
    const parsed = parsePlan(raw)
    const planText = formatPlanMessage(parsed)

    await thinking.delete().catch(() => {})
    const planMessage = await message.reply(planText)
    await planMessage.react('✅').catch(() => {})

    pendingApprovals.set(planMessage.id, {
      request,
      title: parsed.title,
      body: buildIssueBody({ ...parsed, request }),
      repo: IFLEET_REPO,
      owner: IFLEET_OWNER,
      requesterId: message.author.id,
      channelId: message.channelId,
      createdAt: Date.now()
    })
  } catch (e) {
    await thinking.delete().catch(() => {})
    await message.reply(`Failed to generate plan: ${e.message}`)
  }
}

module.exports = {
  pendingApprovals,
  handleIFleetMention,
  parsePlan,
  formatPlanMessage,
  buildIssueBody
}
