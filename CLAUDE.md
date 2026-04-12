# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@iobroker/socket-classes` is a server-side WebSocket abstraction library used by multiple ioBroker adapters (admin, cloud, socketio, ws, rest-api, iot). It provides authenticated, permission-controlled RPC-style commands over WebSocket connections for managing ioBroker objects, states, files, and subscriptions.

## Build & Development Commands

```bash
npm run build           # Full build: TypeScript compilation + docs generation
npm run build-backend   # TypeScript only (tsconfig.build.json), then prebuild tasks
npm run lint            # ESLint (eslint.config.mjs, extends @iobroker/eslint-config)
npm test                # Runs mocha --exit (integration tests)
```

There are two tsconfig files:
- `tsconfig.json` — type-checking only (`noEmit: true`, includes `checkJs`)
- `tsconfig.build.json` — actual compilation to `build/` (`noEmit: false`, no JS checking)

Output goes to `build/`. Only `build/` and `LICENSE` are published to npm.

## Architecture

The library is a class hierarchy with two layers: **socket management** (connections, auth) and **command handling** (RPC operations).

### Class Hierarchy

```
SocketCommon (abstract base)        SocketCommands (base command handler)
    └── SocketAdmin                     └── SocketCommandsAdmin
```

- **SocketCommon** (`src/lib/socketCommon.ts`) — Abstract base managing WebSocket server lifecycle, authentication (passport/bearer tokens), session storage, user ACL resolution, and event publishing. Supports both Socket.io (v2/v4) and `@iobroker/ws-server`.

- **SocketAdmin** (`src/lib/socketAdmin.ts`) — Extends SocketCommon for the admin adapter. Wires up SocketCommandsAdmin and handles publishing state/object/file change events with threshold management.

- **SocketCommands** (`src/lib/socketCommands.ts`) — Implements ~50 RPC commands (getObject, setState, subscribe, readFile, etc.) registered via a `commands` map. Each command has permission metadata defined in `COMMANDS_PERMISSIONS` at the top of the file. Permission checking uses `type` (object/state/file/users/other) and `operation` (read/write/list/delete/create/http/execute/sendto).

- **SocketCommandsAdmin** (`src/lib/socketCommandsAdmin.ts`) — Extends SocketCommands with admin-only operations: user/group management, adapter installation, log retrieval, host management, disk space monitoring.

- **passportSocket** (`src/lib/passportSocket.ts`) — Passport authentication integration for WebSocket connections. Handles cookie-based sessions and Bearer token auth.

### Exports (`src/index.ts`)

The package re-exports all classes plus `passport`, `cookieParser`, and `passportSocket` for consumers to set up their own auth middleware.

### Key Pattern: Command Registration

Commands are registered in the constructor of SocketCommands/SocketCommandsAdmin by populating `this.commands` — a map of command name to handler function. Each handler receives `(socket, callback, ...args)`. The `COMMANDS_PERMISSIONS` constant defines permission requirements per command.

### Subscriptions

The library manages four subscription types (`SocketSubscribeTypes`): `stateChange`, `objectChange`, `fileChange`, `log`. Clients subscribe/unsubscribe per-socket, and the socket classes track subscriptions and publish matching events.
