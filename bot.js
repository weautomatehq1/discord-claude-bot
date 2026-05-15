const { Client, GatewayIntentBits, Partials } = require('discord.js')
const { spawn } = require('child_process')
require('dotenv').config()

const { handleIFleetMention, pendingApprovals } = require('./ifleet-handler')
const { registerReactionWatcher } = require('./ifleet-issuer')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
})

const ALLOWED_CHANNELS = process.env.ALLOWED_CHANNELS?.split(',') ?? []
const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',') ?? []
const CLAUDE = process.env.CLAUDE_PATH ?? 'claude'
const WORK_DIR = process.env.WORK_DIR ?? process.env.HOME

function splitMessage(text, limit = 1990) {
  const chunks = []
  while (text.length > 0) {
    if (text.length <= limit) {
      chunks.push(text)
      break
    }
    let split = text.lastIndexOf('\n', limit)
    if (split === -1) split = limit
    chunks.push(text.slice(0, split))
    text = text.slice(split).trimStart()
  }
  return chunks
}

client.on('ready', () => {
  console.log(`✓ Logged in as ${client.user.tag}`)
  console.log(`✓ Listening on channels: ${ALLOWED_CHANNELS.join(', ')}`)
})

registerReactionWatcher(client, pendingApprovals)

client.on('messageCreate', async (message) => {
  if (message.author.bot) return
  if (!ALLOWED_CHANNELS.includes(message.channelId)) return
  if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(message.author.id)) return

  if (message.mentions.has(client.user)) {
    await handleIFleetMention(message, client)
    return
  }

  const thinking = await message.reply('_thinking..._')

  let output = ''

  const proc = spawn(CLAUDE, ['-p', message.content, '--dangerously-skip-permissions'], {
    cwd: WORK_DIR,
    env: { ...process.env }
  })

  proc.stdout.on('data', (d) => { output += d.toString() })
  proc.stderr.on('data', (d) => { output += d.toString() })

  proc.on('close', async () => {
    await thinking.delete().catch(() => {})

    const text = output.trim() || '_(no output)_'
    const chunks = splitMessage(text)

    for (const chunk of chunks) {
      await message.reply(chunk)
    }
  })

  proc.on('error', async (err) => {
    await thinking.delete().catch(() => {})
    await message.reply(`Error: ${err.message}`)
  })
})

client.login(process.env.DISCORD_BOT_TOKEN)
