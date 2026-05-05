"""Natural Show integration in Home-Assistant."""

import logging
import mimetypes
from pathlib import Path
from typing import Any

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.const import CONF_SOURCE
from homeassistant.core import Event, HomeAssistant

from .const import (
    _DOMAIN_SCHEMA,  # pyright: ignore[reportPrivateUsage]
    ATTR_ADAPTIVE_LIGHTING_MANAGER,
    CONF_LIGHTS,
    CONF_NAME,
    DOMAIN,
    UNDO_UPDATE_LISTENER,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["switch"]

# Static assets directory served at /natural_show/www/
_WWW_URL  = "/natural_show/www"
_WWW_DIR  = Path(__file__).parent / "www"
_REGISTERED = False


def _all_unique_names(value: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Validate that all entities have a unique profile name."""
    hosts = [device[CONF_NAME] for device in value]
    schema = vol.Schema(vol.Unique())
    schema(hosts)
    return value


CONFIG_SCHEMA = vol.Schema(
    {DOMAIN: vol.All(cv.ensure_list, [_DOMAIN_SCHEMA], _all_unique_names)},
    extra=vol.ALLOW_EXTRA,
)


# ---------------------------------------------------------------------------
# HTTP views
# ---------------------------------------------------------------------------

class NaturalShowConfigView(HomeAssistantView):
    """REST endpoint used by the Lovelace card to update a config entry's lights list.

    PUT /api/natural_show/config/<entry_id>
    Body: { "lights": ["light.xxx", ...] }

    Only the ``lights`` key is updated; all other options are preserved.
    The entry is reloaded immediately so the switch reflects the new list.
    """

    url  = "/api/natural_show/config/{entry_id}"
    name = "api:natural_show:config"
    requires_auth = True

    async def put(self, request, entry_id: str):
        """Handle PUT — update options for one config entry.

        Accepts either:
          { "options": { ...full options dict... } }   ← panel saves all settings
          { "lights": [...] }                          ← legacy lights-only update
        """
        hass: HomeAssistant = request.app["hass"]
        entry = hass.config_entries.async_get_entry(entry_id)
        if entry is None or entry.domain != DOMAIN:
            return self.json_message("Entry not found", status_code=404)

        try:
            body = await request.json()
        except Exception:
            return self.json_message("Invalid JSON body", status_code=400)

        if "options" in body:
            new_options = {**entry.options, **body["options"]}
        elif "lights" in body:
            lights = body["lights"]
            if not isinstance(lights, list):
                return self.json_message("'lights' must be a list", status_code=400)
            new_options = {**entry.options, CONF_LIGHTS: lights}
        else:
            return self.json_message("Body must contain 'options' or 'lights'", status_code=400)

        hass.config_entries.async_update_entry(entry, options=new_options)
        await hass.config_entries.async_reload(entry_id)
        return self.json({"success": True, "entry_id": entry_id})

    async def get(self, request, entry_id: str):
        """Handle GET — return current options for one config entry."""
        hass: HomeAssistant = request.app["hass"]
        entry = hass.config_entries.async_get_entry(entry_id)
        if entry is None or entry.domain != DOMAIN:
            return self.json_message("Entry not found", status_code=404)
        return self.json({"entry_id": entry_id, "options": dict(entry.options)})


class NaturalShowStaticView(HomeAssistantView):
    """Serve Natural Show www/ assets without relying on register_static_path."""

    url  = "/natural_show/www/{filename:.+}"
    name = "natural_show:www"
    requires_auth = False

    async def get(self, request, filename: str):
        """Return a file from the www directory."""
        # Block path traversal
        safe = Path(filename).name
        if safe != filename or ".." in filename:
            raise web.HTTPForbidden()
        file_path = _WWW_DIR / safe
        if not file_path.exists() or not file_path.is_file():
            raise web.HTTPNotFound()
        content_type, _ = mimetypes.guess_type(safe)
        if content_type is None:
            content_type = "application/octet-stream"
        return web.Response(body=file_path.read_bytes(), content_type=content_type)


async def reload_configuration_yaml(event: Event) -> None:
    """Reload configuration.yaml."""
    hass: HomeAssistant | None = event.data.get("hass")
    if hass is not None:
        await hass.services.async_call("homeassistant", "check_config", {})
    else:
        _LOGGER.error("HomeAssistant instance not found in event data.")


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up global resources once and import entries from config."""
    global _REGISTERED  # noqa: PLW0603
    if not _REGISTERED:
        _REGISTERED = True
        # Serve www/ files via a view (compatible with all HA versions)
        hass.http.register_view(NaturalShowStaticView)
        # Register REST view used by the panel to persist options
        hass.http.register_view(NaturalShowConfigView)
        # Register the full-page configuration panel at /natural-show
        async_register_panel(
            hass,
            frontend_url_path="natural-show",
            webcomponent_name="natural-show-panel",
            sidebar_title="Natural Show",
            sidebar_icon="mdi:theme-light-dark",
            module_url=f"{_WWW_URL}/natural-show-panel.js",
            require_admin=False,
            embed_iframe=False,
            trust_external=False,
        )
        _LOGGER.debug("Natural Show: panel registered at /natural-show")

    if DOMAIN in config:
        for entry in config[DOMAIN]:
            hass.async_create_task(
                hass.config_entries.flow.async_init(
                    DOMAIN,
                    context={CONF_SOURCE: SOURCE_IMPORT},
                    data=entry,
                ),
            )
    return True


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up the component."""
    data = hass.data.setdefault(DOMAIN, {})

    # This will reload any changes the user made to any YAML configurations.
    # Called during 'quick reload' or hass.reload_config_entry
    hass.bus.async_listen("hass.config.entry_updated", reload_configuration_yaml)

    undo_listener = config_entry.add_update_listener(async_update_options)
    data[config_entry.entry_id] = {UNDO_UPDATE_LISTENER: undo_listener}
    await hass.config_entries.async_forward_entry_setups(config_entry, PLATFORMS)

    return True


async def async_update_options(hass: HomeAssistant, config_entry: ConfigEntry) -> None:
    """Update options."""
    await hass.config_entries.async_reload(config_entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_forward_entry_unload(
        config_entry,
        "switch",
    )
    data = hass.data[DOMAIN]
    data[config_entry.entry_id][UNDO_UPDATE_LISTENER]()
    if unload_ok:
        data.pop(config_entry.entry_id)

    if len(data) == 1 and ATTR_ADAPTIVE_LIGHTING_MANAGER in data:
        # no more config_entries
        manager = data.pop(ATTR_ADAPTIVE_LIGHTING_MANAGER)
        manager.disable()

    if not data:
        hass.data.pop(DOMAIN)

    return unload_ok
