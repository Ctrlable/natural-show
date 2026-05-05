"""Config flow for Natural Show integration."""

import logging
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig

from .const import (  # pylint: disable=unused-import
    CONF_LIGHTS,
    DOMAIN,
    EXTRA_VALIDATION,
    NONE_STR,
    VALIDATION_TUPLES,
)
from .switch import validate

_LOGGER = logging.getLogger(__name__)

OPTIONS_FLOW_DESCRIPTION_PLACEHOLDERS = {
    "webapp_url": "https://ctrlable.github.io/natural-show",
    "docs_url": "https://github.com/Ctrlable/natural-show#readme",
}

_CIRCADIAN_CONF = {
    "min_brightness",
    "max_brightness",
    "min_color_temp",
    "max_color_temp",
    "prefer_rgb_color",
    "sleep_brightness",
    "sleep_rgb_or_color_temp",
    "sleep_color_temp",
    "sleep_rgb_color",
    "sleep_transition",
    "transition_until_sleep",
    "sunrise_time",
    "min_sunrise_time",
    "max_sunrise_time",
    "sunrise_offset",
    "sunset_time",
    "min_sunset_time",
    "max_sunset_time",
    "sunset_offset",
    "brightness_mode",
    "brightness_mode_time_dark",
    "brightness_mode_time_light",
}

_ADVANCED_CONF = {
    "interval",
    "transition",
    "initial_transition",
    "take_over_control",
    "take_over_control_mode",
    "detect_non_ha_changes",
    "autoreset_control_seconds",
    "only_once",
    "adapt_only_on_bare_turn_on",
    "separate_turn_on_commands",
    "send_split_delay",
    "adapt_delay",
    "skip_redundant_commands",
    "intercept",
    "multi_light_intercept",
    "include_config_in_attributes",
}


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Natural Show."""

    VERSION = 1

    source_options: dict[str, Any] | None = None

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        """Handle the initial step."""
        if user_input is None and self._async_current_entries():
            return await self.async_step_menu()
        return await self.async_step_wait_for_name(user_input)

    async def async_step_menu(self, user_input: dict[str, Any] | None = None):
        """Handle the menu step."""
        if user_input is not None:
            if user_input["action"] != "new":
                entry_id = user_input["action"]
                entry = self.hass.config_entries.async_get_entry(entry_id)
                if entry:
                    self.source_options = dict(entry.options)
            return await self.async_step_wait_for_name()

        entries = self._async_current_entries()
        options = {"new": "Create new instance"}
        for entry in entries:
            options[entry.entry_id] = f"Duplicate '{entry.title}'"

        return self.async_show_form(
            step_id="menu",
            data_schema=vol.Schema(
                {vol.Required("action", default="new"): vol.In(options)},
            ),
        )

    async def async_step_wait_for_name(self, user_input: dict[str, Any] | None = None):
        """Handle the name step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            await self.async_set_unique_id(user_input[CONF_NAME])
            self._abort_if_unique_id_configured()
            options = self.source_options
            return self.async_create_entry(
                title=user_input[CONF_NAME],
                data=user_input,
                options=options,
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_NAME): str}),
            errors=errors,
        )

    async def async_step_import(self, user_input: dict[str, Any] | None = None):
        """Handle configuration by YAML file."""
        if user_input is None:
            return self.async_abort(reason="no_data")

        await self.async_set_unique_id(user_input[CONF_NAME])
        # Keep a list of switches that are configured via YAML
        data = self.hass.data.setdefault(DOMAIN, {})
        data.setdefault("__yaml__", set()).add(self.unique_id)

        for entry in self._async_current_entries():
            if entry.unique_id == self.unique_id:
                self.hass.config_entries.async_update_entry(entry, data=user_input)
                self._abort_if_unique_id_configured()

        return self.async_create_entry(title=user_input[CONF_NAME], data=user_input)

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,  # noqa: ARG004
    ) -> "OptionsFlowHandler":
        """Get the options flow for this handler."""
        return OptionsFlowHandler()


def validate_options(user_input: dict[str, Any], errors: dict[str, str]) -> None:
    """Validate the options in the OptionsFlow.

    This is an extra validation step because the validators
    in `EXTRA_VALIDATION` cannot be serialized to json.
    """
    for key, (_validate, _) in EXTRA_VALIDATION.items():
        value = user_input.get(key)
        try:
            if value is not None and value != NONE_STR:
                _validate(value)
        except vol.Invalid:
            _LOGGER.exception("Configuration option %s=%s is incorrect", key, value)
            errors["base"] = "option_error"


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Handle a 3-step options flow for Natural Show."""

    def __init__(self) -> None:
        """Initialize options flow."""
        self._options: dict[str, Any] = {}

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        """Redirect to the lights step, or show a notice for YAML-configured entries."""
        conf = self.config_entry
        if conf.source == config_entries.SOURCE_IMPORT:
            return self.async_show_form(
                step_id="init",
                data_schema=None,
                description_placeholders=OPTIONS_FLOW_DESCRIPTION_PLACEHOLDERS,
            )
        return await self.async_step_lights()

    async def async_step_lights(self, user_input: dict[str, Any] | None = None):
        """Step 1 — Select which lights this instance controls."""
        errors: dict[str, str] = {}
        conf = self.config_entry

        if user_input is not None:
            self._options.update(user_input)
            return await self.async_step_circadian()

        current_lights: list[str] = conf.options.get(CONF_LIGHTS, [])

        all_lights = set(self.hass.states.async_entity_ids("light"))
        for light in current_lights:
            if light not in all_lights:
                errors[CONF_LIGHTS] = "entity_missing"
                _LOGGER.error(
                    "%s: light entity %s is configured, but was not found",
                    conf.title,
                    light,
                )

        data_schema = vol.Schema(
            {
                vol.Optional(CONF_LIGHTS, default=current_lights): EntitySelector(
                    EntitySelectorConfig(domain="light", multiple=True),
                ),
            }
        )

        return self.async_show_form(
            step_id="lights",
            data_schema=data_schema,
            errors=errors,
            description_placeholders=OPTIONS_FLOW_DESCRIPTION_PLACEHOLDERS,
        )

    async def async_step_circadian(self, user_input: dict[str, Any] | None = None):
        """Step 2 — Configure the circadian program (brightness & color)."""
        errors: dict[str, str] = {}

        if user_input is not None:
            validate_options(user_input, errors)
            if not errors:
                self._options.update(user_input)
                return await self.async_step_advanced()

        return self.async_show_form(
            step_id="circadian",
            data_schema=self._schema_for(_CIRCADIAN_CONF),
            errors=errors,
            description_placeholders=OPTIONS_FLOW_DESCRIPTION_PLACEHOLDERS,
        )

    async def async_step_advanced(self, user_input: dict[str, Any] | None = None):
        """Step 3 — Configure advanced behavior settings (final step)."""
        errors: dict[str, str] = {}

        if user_input is not None:
            validate_options(user_input, errors)
            if not errors:
                self._options.update(user_input)
                return self.async_create_entry(title="", data=self._options)

        return self.async_show_form(
            step_id="advanced",
            data_schema=self._schema_for(_ADVANCED_CONF),
            errors=errors,
            description_placeholders=OPTIONS_FLOW_DESCRIPTION_PLACEHOLDERS,
        )

    def _schema_for(self, names: set[str]) -> vol.Schema:
        """Build a vol.Schema for the given set of option names."""
        conf = self.config_entry
        schema: dict[Any, Any] = {}
        for name, default, validation in VALIDATION_TUPLES:
            if name not in names:
                continue
            current = self._options.get(name, conf.options.get(name, default))
            schema[vol.Optional(name, default=current)] = validation
        return vol.Schema(schema)
