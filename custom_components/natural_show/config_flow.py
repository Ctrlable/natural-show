"""Config flow for Natural Show integration."""

import logging
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.core import callback

from .const import (  # pylint: disable=unused-import
    DOMAIN,
    EXTRA_VALIDATION,
    NONE_STR,
)

_LOGGER = logging.getLogger(__name__)

_PANEL_URL = "/natural-show"

OPTIONS_FLOW_DESCRIPTION_PLACEHOLDERS = {
    "webapp_url": "https://ctrlable.github.io/natural-show",
    "docs_url": "https://github.com/Ctrlable/natural-show#readme",
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
            return self.async_create_entry(
                title=user_input[CONF_NAME],
                data=user_input,
                options=self.source_options or {},
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


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Options flow: opens the full-page configuration panel directly via external step."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        """Open the panel immediately; complete when the panel calls WS configure."""
        conf = self.config_entry

        if conf.source == config_entries.SOURCE_IMPORT:
            return self.async_show_form(
                step_id="init",
                data_schema=None,
                description_placeholders=OPTIONS_FLOW_DESCRIPTION_PLACEHOLDERS,
            )

        if user_input is not None:
            # Panel saved options and called the WS configure endpoint → finish.
            return self.async_external_step_done(next_step_id="finish")

        # Redirect immediately to the full-page panel.
        return self.async_external_step(
            step_id="init",
            url=f"{_PANEL_URL}?entry_id={conf.entry_id}&flow_id={self.flow_id}",
        )

    async def async_step_finish(self, user_input: dict[str, Any] | None = None):
        """Finalise the options flow after the panel saves."""
        return self.async_create_entry(title="", data=dict(self.config_entry.options))
