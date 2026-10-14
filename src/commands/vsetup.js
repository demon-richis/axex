const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { saveMemberRoleIds } = require("../db/client");
const embeds = require("../config/messages");
const {
  autoSetup,
  inspectResources,
  SetupError,
} = require("../setup/autoSetup");

const pendingSetups = new Map();
const PROGRESS_STEPS = 13;
const PENDING_SETUP_TTL_MS = 10 * 60 * 1000;

function beginPendingSetup(
  guildId,
  userId,
  stage,
  memberRoleIds = [],
  timeoutSeconds = 60,
  settings = {},
) {
  const token = uuidv4();
  pendingSetups.set(token, {
    guildId,
    userId,
    stage,
    memberRoleIds,
    timeoutSeconds,
    settings,
    expiresAt: Date.now() + PENDING_SETUP_TTL_MS,
  });
  return token;
}

function consumePendingSetup(token) {
  const pending = pendingSetups.get(token);
  pendingSetups.delete(token);
  return pending || null;
}

async function runSetup(
  interaction,
  strategy,
  configuredMemberRoleIds,
  timeoutSeconds = 60,
  settings = {},
) {
  const progress = {};
  const updateProgress = async (step, status, detail = "") => {
    progress[step] = { status, detail };
    await interaction
      .editReply({ embeds: [embeds.setup.progress(progress)] })
      .catch(() => {});
  };
  try {
    for (let step = 1; step <= PROGRESS_STEPS; step += 1)
      progress[step] = { status: "pending", detail: "" };
    await interaction.editReply({
      embeds: [embeds.setup.progress(progress)],
      components: [],
    });
    const config = await autoSetup(interaction.guild, {
      strategy,
      memberRoleIds: configuredMemberRoleIds,
      timeoutSeconds,
      onProgress: updateProgress,
      ...settings,
    });
    const responseEmbeds = [
      embeds.setup.success({
        ...config,
        settings: {
          ...settings,
          guildName: interaction.guild.name,
        },
      }),
    ];
    if (!config.hierarchyOk)
      responseEmbeds.push(embeds.setup.roleHierarchyWarn());
    await interaction.editReply({ embeds: responseEmbeds, components: [] });
  } catch (error) {
    const setupError =
      error instanceof SetupError
        ? error
        : new SetupError([], ["Unexpected setup error"]);
    await interaction
      .editReply({
        embeds: [embeds.setup.failure(setupError.completed, setupError.failed)],
        components: [],
      })
      .catch(() => {});
  }
}

async function validatePendingOwner(interaction, token) {
  const pending = pendingSetups.get(token);
  if (
    !pending ||
    pending.guildId !== interaction.guildId ||
    pending.expiresAt <= Date.now()
  ) {
    consumePendingSetup(token);
    await interaction.reply({
      embeds: [embeds.setup.confirmationExpired()],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  if (pending.userId !== interaction.user.id) {
    await interaction.reply({
      embeds: [embeds.setup.notSetupOwner()],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return pending;
}

async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({
      embeds: [embeds.setup.guildOnly()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      embeds: [embeds.setup.permissionDenied()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const timeoutSeconds = 60;
  const minAge = interaction.options.getInteger("min-age") ?? 7;
  const raidThreshold = interaction.options.getInteger("raid-threshold") ?? 10;
  const raidAge = interaction.options.getInteger("raid-age") ?? 30;
  const raidTiming = interaction.options.getInteger("raid-timing") ?? 2500;
  const honeypot = interaction.options.getBoolean("honeypot") ?? true;
  const vpnCheck = interaction.options.getBoolean("vpn-check") ?? true;
  const newAccountAction =
    interaction.options.getString("new-account-action") ?? "warn";
  const suspiciousAction =
    interaction.options.getString("suspicious-action") ?? "flag";

  const settings = {
    minAge,
    raidThreshold,
    raidAge,
    raidTiming,
    honeypot,
    vpnCheck,
    newAccountAction,
    suspiciousAction,
  };

  const token = beginPendingSetup(
    interaction.guild.id,
    interaction.user.id,
    "roles",
    [],
    timeoutSeconds,
    settings,
  );
  await interaction.reply(embeds.setup.configureRolesPrompt(token));
}

async function handleSetupButton(interaction) {
  const match =
    /^axex_setup_(start|reconfigure|cancel|use|create|delete|delete_confirm)_([0-9a-f-]{36})$/.exec(
      interaction.customId,
    );
  if (!match) return false;
  const [, action, token] = match;
  const pending = await validatePendingOwner(interaction, token);
  if (!pending) return true;

  if (action === "start" && pending.stage === "roles") {
    await interaction.update(embeds.setup.rolesMenu(interaction.guild, token));
    return true;
  }

  if (action === "cancel") {
    consumePendingSetup(token);
    await interaction.update({
      embeds: [embeds.setup.cancelled()],
      components: [],
    });
    return true;
  }
  if (action === "reconfigure" && pending.stage === "confirm") {
    const { memberRoleIds } = consumePendingSetup(token);
    const resources = inspectResources(interaction.guild);
    const choiceToken = beginPendingSetup(
      interaction.guild.id,
      interaction.user.id,
      "strategy",
      memberRoleIds,
      pending.timeoutSeconds,
      pending.settings,
    );
    await interaction.update({
      embeds: [embeds.setup.existingResources(resources)],
      ...embeds.setup.resourceButtons(choiceToken, "strategy", resources),
    });
    return true;
  }
  if (action === "delete" && pending.stage === "strategy") {
    pendingSetups.set(token, { ...pending, stage: "delete-confirm" });
    await interaction.update(embeds.setup.confirmDeleteResources(token));
    return true;
  }
  if (
    ((action === "use" || action === "create") &&
      pending.stage === "strategy") ||
    (action === "delete_confirm" && pending.stage === "delete-confirm")
  ) {
    const { memberRoleIds } = consumePendingSetup(token);
    await interaction.deferUpdate();
    if (!(await saveMemberRoleIds(interaction.guild.id, memberRoleIds))) {
      await interaction.editReply({
        embeds: [embeds.setup.saveRolesFailed()],
        components: [],
      });
      return true;
    }
    await runSetup(
      interaction,
      action === "delete_confirm" ? "delete-recreate" : "use-existing",
      memberRoleIds,
      pending.timeoutSeconds,
      pending.settings,
    );
    return true;
  }

  consumePendingSetup(token);
  await interaction.update({
    embeds: [embeds.setup.confirmationExpired()],
    components: [],
  });
  return true;
}

async function handleRoleSelect(interaction) {
  const match = /^axex_setup_roles_([0-9a-f-]{36})$/.exec(interaction.customId);
  if (!match || !interaction.guild) return false;
  const [, token] = match;
  const pending = await validatePendingOwner(interaction, token);
  if (!pending || pending.stage !== "roles") return true;
  const memberRoleIds = interaction.values.filter((roleId) => {
    const role = interaction.guild.roles.cache.get(roleId);
    return role && !role.managed && role.id !== interaction.guild.id;
  });
  if (!memberRoleIds.length) {
    await interaction.update({
      embeds: [embeds.setup.invalidRoleIds()],
      components: [],
    });
    consumePendingSetup(token);
    return true;
  }
  consumePendingSetup(token);
  const resources = inspectResources(interaction.guild);
  const choiceToken = beginPendingSetup(
    interaction.guild.id,
    interaction.user.id,
    "strategy",
    memberRoleIds,
    pending.timeoutSeconds,
    pending.settings,
  );
  await interaction.update({
    embeds: [embeds.setup.existingResources(resources)],
    ...embeds.setup.resourceButtons(choiceToken, "strategy", resources),
  });
  return true;
}

module.exports = {
  execute,
  handleSetupButton,
  handleRoleSelect,
  beginPendingSetup,
  runSetup,
  inspectResources,
};
