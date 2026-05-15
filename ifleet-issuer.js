'use strict'

const https = require('node:https')

const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',') ?? []
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const DEFAULT_OWNER = process.env.IFLEET_REPO_OWNER ?? 'weautomatehq1'
const DEFAULT_REPO = process.env.IFLEET_REPO_NAME ?? 'IFleet'

function createGitHubIssue({ owner, repo, title, body, token }) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ title, body, labels: ['auto:ship'] })
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ifleet-discord-bot',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (d) => { raw += d })
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw))
          } catch (e) {
            reject(new Error(`GitHub response parse error: ${raw}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function registerReactionWatcher(client, pendingApprovals) {
  client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.partial) {
      try {
        await reaction.fetch()
      } catch (err) {
        console.error('[issuer] Failed to fetch partial reaction:', err)
        return
      }
    }

    if (user.bot) return
    if (reaction.emoji.name !== '✅') return
    if (!ALLOWED_USERS.includes(user.id)) return

    const messageId = reaction.message.id
    if (!pendingApprovals.has(messageId)) return

    const entry = pendingApprovals.get(messageId)
    pendingApprovals.delete(messageId)

    const owner = entry.owner ?? DEFAULT_OWNER
    const repo = entry.repo ?? DEFAULT_REPO

    if (!GITHUB_TOKEN) {
      console.error('[issuer] GITHUB_TOKEN not set — cannot create issue')
      await reaction.message.reply('Error: GITHUB_TOKEN is not configured.').catch(() => {})
      return
    }

    let issue
    try {
      issue = await createGitHubIssue({
        owner,
        repo,
        title: entry.title,
        body: entry.body,
        token: GITHUB_TOKEN,
      })
    } catch (err) {
      console.error('[issuer] GitHub API error:', err)
      await reaction.message.reply(`Error creating issue: ${err.message}`).catch(() => {})
      return
    }

    if (issue.errors || !issue.number) {
      console.error('[issuer] GitHub returned an error:', JSON.stringify(issue))
      await reaction.message
        .reply(`GitHub error: ${issue.message ?? JSON.stringify(issue)}`)
        .catch(() => {})
      return
    }

    const confirmation =
      `✅ Issue created: **${issue.title}**\n` +
      `https://github.com/${owner}/${repo}/issues/${issue.number}\n` +
      `IFleet is on it.`

    await reaction.message.reply(confirmation).catch((err) => {
      console.error('[issuer] Failed to send confirmation:', err)
    })
  })
}

module.exports = { registerReactionWatcher }
