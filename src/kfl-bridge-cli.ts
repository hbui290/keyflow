#!/usr/bin/env bun
import {
  bridgeAddAccount,
  bridgeDoctor,
  bridgeLinkCurrent,
  bridgeRefresh,
  bridgeReloginAccount,
  bridgeRemoveAccount,
  bridgeStatus,
  bridgeUse,
  bridgePrime,
  runBridgeCommand,
  printBridgeResponse,
} from './kfl-bridge.js'

type ParsedCommand =
  | { kind: 'status' }
  | { kind: 'link-current' }
  | { kind: 'refresh'; active: boolean; all: boolean; accountId?: string }
  | { kind: 'use'; accountId: string }
  | { kind: 'add'; label: string; deviceAuth: boolean }
  | { kind: 'relogin'; accountId: string; deviceAuth: boolean }
  | { kind: 'remove'; accountId: string; purge: boolean }
  | { kind: 'doctor' }
  | { kind: 'prime'; accountId?: string }

function usage(): string {
  return [
    'Usage: bridge-cli <command> [options]',
    '',
    'Commands:',
    '  status',
    '  link-current',
    '  refresh [--active] [--all] [--account <id>]',
    '  use --account <id>',
    '  add --label <label> [--device-auth]',
    '  relogin --account <id> [--device-auth]',
    '  remove --account <id> [--purge]',
    '  doctor',
    '  prime [--account <id>]',
  ].join('\n')
}

function shiftValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}.`)
  }
  return value
}

function parseCommand(argv: string[]): ParsedCommand {
  const [command, ...rest] = argv

  switch (command) {
    case 'status':
      return { kind: 'status' }
    case 'link-current':
      return { kind: 'link-current' }
    case 'doctor':
      return { kind: 'doctor' }
    case 'refresh': {
      let active = false
      let all = false
      let accountId: string | undefined

      for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index]
        switch (token) {
          case '--active':
            active = true
            break
          case '--all':
            all = true
            break
          case '--account':
            accountId = shiftValue(rest, index, token)
            index += 1
            break
          default:
            throw new Error(`Unknown option for refresh: ${token}`)
        }
      }

      return { kind: 'refresh', active, all, accountId }
    }
    case 'use': {
      let accountId: string | undefined

      for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index]
        switch (token) {
          case '--account':
            accountId = shiftValue(rest, index, token)
            index += 1
            break
          default:
            throw new Error(`Unknown option for use: ${token}`)
        }
      }

      if (!accountId) {
        throw new Error('Missing required --account for use.')
      }

      return { kind: 'use', accountId }
    }
    case 'add': {
      let label: string | undefined
      let deviceAuth = false

      for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index]
        switch (token) {
          case '--label':
            label = shiftValue(rest, index, token)
            index += 1
            break
          case '--device-auth':
            deviceAuth = true
            break
          default:
            throw new Error(`Unknown option for add: ${token}`)
        }
      }

      if (!label) {
        throw new Error('Missing required --label for add.')
      }

      return { kind: 'add', label, deviceAuth }
    }
    case 'relogin': {
      let accountId: string | undefined
      let deviceAuth = false

      for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index]
        switch (token) {
          case '--account':
            accountId = shiftValue(rest, index, token)
            index += 1
            break
          case '--device-auth':
            deviceAuth = true
            break
          default:
            throw new Error(`Unknown option for relogin: ${token}`)
        }
      }

      if (!accountId) {
        throw new Error('Missing required --account for relogin.')
      }

      return { kind: 'relogin', accountId, deviceAuth }
    }
    case 'remove': {
      let accountId: string | undefined
      let purge = false

      for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index]
        switch (token) {
          case '--account':
            accountId = shiftValue(rest, index, token)
            index += 1
            break
          case '--purge':
            purge = true
            break
          default:
            throw new Error(`Unknown option for remove: ${token}`)
        }
      }

      if (!accountId) {
        throw new Error('Missing required --account for remove.')
      }

      return { kind: 'remove', accountId, purge }
    }
    case 'prime': {
      let accountId: string | undefined

      for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index]
        switch (token) {
          case '--account':
            accountId = shiftValue(rest, index, token)
            index += 1
            break
          default:
            throw new Error(`Unknown option for prime: ${token}`)
        }
      }

      return { kind: 'prime', accountId }
    }
    case undefined:
      throw new Error(usage())
    default:
      throw new Error(`Unknown bridge command: ${command}\n\n${usage()}`)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    return
  }

  try {
    const command = parseCommand(argv)

    switch (command.kind) {
      case 'status':
        await runBridgeCommand(() => bridgeStatus())
        return
      case 'link-current':
        await runBridgeCommand(() => bridgeLinkCurrent())
        return
      case 'refresh':
        await runBridgeCommand(() =>
          bridgeRefresh({
            active: command.active,
            all: command.all,
            accountId: command.accountId,
          })
        )
        return
      case 'use':
        await runBridgeCommand(() => bridgeUse(command.accountId))
        return
      case 'add':
        await runBridgeCommand(() =>
          bridgeAddAccount({
            label: command.label,
            deviceAuth: command.deviceAuth,
          })
        )
        return
      case 'relogin':
        await runBridgeCommand(() =>
          bridgeReloginAccount({
            accountId: command.accountId,
            deviceAuth: command.deviceAuth,
          })
        )
        return
      case 'remove':
        await runBridgeCommand(() =>
          bridgeRemoveAccount({
            accountId: command.accountId,
            purge: command.purge,
          })
        )
        return
      case 'doctor':
        await runBridgeCommand(() => bridgeDoctor())
        return
      case 'prime':
        await runBridgeCommand(() => bridgePrime(command.accountId))
        return
    }
  } catch (error: any) {
    printBridgeResponse<never>({
      ok: false,
      error: {
        code: 'bridge_error',
        message: error?.message ?? String(error),
      },
    })
    process.exitCode = 1
  }
}

await main()
