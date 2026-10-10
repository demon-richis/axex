require("dotenv").config();

const { REST, Routes, PermissionFlagsBits } = require("discord.js");

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
  console.error(
    "BOT_TOKEN and CLIENT_ID must be set before deploying commands.",
  );
  process.exit(1);
}

const commands = [
  {
    name: "vsetup",
    description: "Configure Axex verification system for this server",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    dm_permission: false,
    options: [
      {
        name: "timeout",
        description: "Verification timeout in seconds (default: 60)",
        type: 4,
        required: false,
        min_value: 30,
        max_value: 300,
      },
      {
        name: "min-age",
        description: "Minimum account age in days (default: 7)",
        type: 4,
        required: false,
        min_value: 0,
        max_value: 365,
      },
      {
        name: "raid-threshold",
        description: "Joins per 30s to trigger raid mode (default: 10)",
        type: 4,
        required: false,
        min_value: 3,
        max_value: 50,
      },
      {
        name: "raid-age",
        description:
          "Account age requirement during raid mode in days (default: 30)",
        type: 4,
        required: false,
        min_value: 0,
        max_value: 365,
      },
      {
        name: "raid-timing",
        description:
          "Minimum click speed during raid mode in ms (default: 2500)",
        type: 4,
        required: false,
        min_value: 1000,
        max_value: 5000,
      },
      {
        name: "honeypot",
        description: "Enable honeypot button (default: true)",
        type: 5,
        required: false,
      },
      {
        name: "vpn-check",
        description: "Enable VPN/proxy detection (default: true)",
        type: 5,
        required: false,
      },
      {
        name: "new-account-action",
        description: "Action for accounts below min-age (default: warn)",
        type: 3,
        required: false,
        choices: [
          { name: "warn", value: "warn" },
          { name: "strict", value: "strict" },
          { name: "block", value: "block" },
        ],
      },
      {
        name: "suspicious-action",
        description: "Action for suspicious timing (default: flag)",
        type: 3,
        required: false,
        choices: [
          { name: "flag", value: "flag" },
          { name: "queue", value: "queue" },
          { name: "quarantine", value: "quarantine" },
        ],
      },
    ],
  },
  {
    name: "eventmode",
    description: "Enable or disable event mode (disables account age check)",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    dm_permission: false,
    options: [
      {
        name: "action",
        type: 3,
        description: "Enable or disable event mode",
        required: true,
        choices: [
          { name: "on", value: "on" },
          { name: "off", value: "off" },
        ],
      },
      {
        name: "hours",
        type: 4,
        description: "Auto-disable after this many hours (1-24)",
        required: false,
        min_value: 1,
        max_value: 24,
      },
    ],
  },
  {
    name: "queue",
    description: "Manage the verification approval queue",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    dm_permission: false,
    options: [
      { name: "list", type: 1, description: "View pending queue" },
      {
        name: "approve",
        type: 1,
        description: "Approve a user",
        options: [
          {
            name: "user",
            type: 6,
            description: "User to approve",
            required: true,
          },
        ],
      },
      {
        name: "reject",
        type: 1,
        description: "Reject a user",
        options: [
          {
            name: "user",
            type: 6,
            description: "User to reject",
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: "axex",
    description: "Manage and repair Axex security installation",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    dm_permission: false,
    options: [
      {
        name: "repair",
        type: 1,
        description:
          "Repair missing Axex roles, channels, permissions, and panel",
      },
    ],
  },
  {
    name: "verification-log",
    description: "View the complete verification timeline for a case ID",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    dm_permission: false,
    options: [
      {
        name: "reference",
        description: "Case ID, for example AX-1A2B3C4D",
        type: 3,
        required: false,
        min_length: 11,
        max_length: 11,
      },
      {
        name: "user",
        description: "Filter events for a Discord user",
        type: 6,
        required: false,
      },
      {
        name: "action",
        description: "Filter by event action, such as VERIFIED",
        type: 3,
        required: false,
        max_length: 80,
      },
      {
        name: "format",
        description: "Choose an embed report or complete JSON export",
        type: 3,
        required: false,
        choices: [
          { name: "Detailed embeds", value: "embed" },
          { name: "JSON export", value: "json" },
        ],
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
    console.log("Slash commands registered globally");
  } catch (error) {
    console.error("Could not register global slash commands:", error);
    process.exitCode = 1;
  }
})();
