"""Tests for Natural Show integration."""

from homeassistant.components import natural_show
from homeassistant.components.natural_show.const import (
    DEFAULT_NAME,
    UNDO_UPDATE_LISTENER,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import CONF_NAME
from homeassistant.setup import async_setup_component

from tests.common import MockConfigEntry


async def test_setup_with_config(hass):
    """Test that we import the config and setup the integration."""
    config = {
        natural_show.DOMAIN: {
            natural_show.CONF_NAME: DEFAULT_NAME,
        },
    }
    assert await async_setup_component(hass, natural_show.DOMAIN, config)
    assert natural_show.DOMAIN in hass.data


async def test_successful_config_entry(hass):
    """Test that Natural Show is configured successfully."""
    entry = MockConfigEntry(
        domain=natural_show.DOMAIN,
        data={CONF_NAME: DEFAULT_NAME},
    )
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    assert entry.state == ConfigEntryState.LOADED

    assert UNDO_UPDATE_LISTENER in hass.data[natural_show.DOMAIN][entry.entry_id]


async def test_unload_entry(hass):
    """Test removing Natural Show."""
    entry = MockConfigEntry(
        domain=natural_show.DOMAIN,
        data={CONF_NAME: DEFAULT_NAME},
    )
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state == ConfigEntryState.NOT_LOADED
    assert natural_show.DOMAIN not in hass.data
