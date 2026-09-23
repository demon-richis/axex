# Axex Security — Features

## Overview
Axex Security is a Discord verification bot designed to protect guilds from unverified users, low-trust accounts, and raid activity. It enforces a simple verification flow with guild-specific configuration, timed challenge sessions, and automatic moderation safeguards.

## Core Features

- Normal verification
  - Sends a verification prompt for standard members.
  - Uses a short, minimal embed with a letter-button challenge.

- New account detection
  - Flags users below the configured minimum account age.
  - Applies warning, stricter timing, or blocking behavior based on settings.

- Raid mode
  - Detects suspicious join bursts using a configurable threshold.
  - Switches verification into stricter raid-mode behavior.

- Permanent panel
  - Creates a persistent verification panel in the guild verify channel.
  - Uses a fixed button to start verification for new members.

- Per-guild name
  - Uses the current guild name in verification prompts and permanent panel messages.
  - Makes the bot fit each server without hardcoded branding.

- DM challenge with letter buttons
  - Sends a private verification challenge to the user.
  - Requires selecting the correct letter button before access is granted.

- 60s timeout
  - Verification sessions expire after the configured timeout window.
  - Timed-out users are quarantined automatically.

- Fallback with mention
  - If the standard channel message is unavailable, the bot falls back to a direct mention in the verify channel.

- Custom emojis
  - Uses custom Discord emoji IDs for verification, pending, suspicious, and protected states.

- Minimal embed design
  - Uses compact description-only embeds with clear, direct messaging.
  - Keeps the UI lightweight and consistent across verification modes.

## Embed Styles

| Mode | Color | Trigger |
| --- | --- | --- |
| Normal | 0x00FF88 | Standard member verification |
| New account | 0xFFA500 | Account age below minimum |
| Raid mode | 0xFF0000 | Join threshold exceeded |
| Permanent panel | 0x8B5CF6 | Guild verify channel panel |

## Buttons

| Label | Custom ID | Style | Emoji |
| --- | --- | --- | --- |
| Verify | axex_verify_start | Success | ✅ |
| Letter button | axex_<word>_<uuid> | Secondary | None |
| Honeypot | axex_<word>_<uuid> | Danger | None |

## Emojis

| Name | ID | Purpose |
| --- | --- | --- |
| user | 1550520335919481002 | Member/user access prompt |
| pending | 1551656840817938472 | Timeout reminder |
| suspicious | 1550515702006554774 | New account or suspicious activity |
| protected | 1550516426530488443 | Raid protection state |
| verify | 1551154167727398993 | Verification branding |
| success | 1550511021146247239 | Verified success state |
| unsuccessful | 1550510059262451733 | Failed verification |
| verified | 1550465125440430191 | Verified account state |

## Colors

| Mode | Hex | Decimal |
| --- | --- | --- |
| Normal | 0x00FF88 | 65336 |
| New account | 0xFFA500 | 16753920 |
| Raid mode | 0xFF0000 | 16711680 |
| Permanent panel | 0x8B5CF6 | 9139942 |
| Owner notice | 0xFFD700 | 14297088 |
