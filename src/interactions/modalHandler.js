const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const embeds = require("../config/messages");
const { beginPendingSetup, inspectResources } = require("../commands/vsetup");

function parseRoleIds(value) {
  return [
    ...new Set(
      value.split(",").flatMap((part) => {
        const match = part.trim().match(/^(?:<@&(\d{17,19})>|(\d{17,19}))$/);
        return match ? [match[1] || match[2]] : [];
      }),
    ),
  ];
}

async function execute(interaction) {
  if (
    !interaction.isModalSubmit() ||
    interaction.customId !== "axex_setup_roles_modal"
  )
    return false;
  if (!interaction.guild) {
    await interaction.reply({
      embeds: [embeds.setup.guildOnly()],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      embeds: [embeds.setup.permissionDenied()],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const memberRoleIds = parseRoleIds(
    interaction.fields.getTextInputValue("role_ids_input"),
  );
  if (memberRoleIds.length === 0) {
    await interaction.reply({
      embeds: [embeds.setup.invalidRoleIds()],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const timeoutSeconds = 60;
  const token = beginPendingSetup(
    interaction.guild.id,
    interaction.user.id,
    "strategy",
    memberRoleIds,
    timeoutSeconds,
  );
  const resources = inspectResources(interaction.guild);
  await interaction.reply({
    embeds: [embeds.setup.existingResources(resources)],
    ...embeds.setup.resourceButtons(token, "strategy", resources),
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

module.exports = { execute };
