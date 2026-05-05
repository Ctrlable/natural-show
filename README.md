[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg?style=for-the-badge)](https://github.com/hacs/integration)
![Version](https://img.shields.io/github/v/release/Ctrlable/natural-show?style=for-the-badge)

# 🌞 Natural Show: Enhance Your Home's Atmosphere with Smart, Sun-Synchronized Lighting 🌙


[Natural Show](https://github.com/Ctrlable/natural-show) is a custom component for [Home Assistant](https://www.home-assistant.io/) that intelligently adjusts the brightness and color of your lights 💡 based on the sun's position, while still allowing for manual control.

## :arrow_down: Installation via HACS

Natural Show is installed as a **custom repository** in [HACS (Home Assistant Community Store)](https://hacs.xyz/).

### One-click (My Home Assistant)

Click the button below — it will open HACS and pre-fill the repository URL for you:

[![Open your Home Assistant instance and open the Natural Show integration inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Ctrlable&repository=natural-show&category=integration)

### Manual steps

1. Make sure [HACS](https://hacs.xyz/docs/use/download/download/#to-download-hacs-core) is installed in your Home Assistant instance.
2. In the HACS panel, click the **⋮** (three-dot menu) in the top-right corner and choose **Custom repositories**.
3. Enter the URL `https://github.com/Ctrlable/natural-show` and set the category to **Integration**, then click **Add**.
4. Search for **Natural Show** in HACS and click **Download**.
5. Restart Home Assistant.
6. Go to **Settings → Devices & Services → + Add Integration** and search for **Natural Show**.

### Lovelace card (bundled)

The enhanced configuration card (`natural-show-config-card`) is bundled with the integration and served automatically. After installing and restarting, add it once to your Lovelace resources:

```
/natural_show/www/natural-show-config-card.js   (type: module)
```

Then add a card to any dashboard:

```yaml
type: custom:natural-show-config-card
```

By automatically adapting the settings of your lights throughout the day, Natural Show helps maintain your natural circadian rhythm 😴, which can lead to improved sleep, mood, and overall well-being. Experience cooler color temperatures at noon, gradually transitioning to warmer colors at sunset and sunrise.

In addition to its regular mode, Natural Show also offers a "sleep mode" 🌜 which sets your lights to minimal brightness and a very warm color, perfect for winding down at night.

> 🌈 Visualize Natural Show's settings with the [_🌞 Natural Show Simulator WebApp 🌛_](https://ctrlable.github.io/natural-show)


[[ToC](#books-table-of-contents)]

<!-- SECTION:features:START -->
## :bulb: Features

When initially turning on a light that is controlled by Natural Show, the `light.turn_on` service call is intercepted, and the light's brightness and color are automatically adjusted based on the sun's position.
After that, the light's brightness and color are automatically adjusted at a regular interval.

Natural Show provides four switches (using "living_room" as an example component name):

- `switch.natural_show_living_room`: Turn Natural Show on or off and view current light settings through its attributes.
- `switch.natural_show_sleep_mode_living_room`: Activate "sleep mode" 😴 and set custom sleep_brightness and sleep_color_temp.
- `switch.natural_show_adapt_brightness_living_room`: Enable or disable brightness adaptation 🔆 for supported lights.
- `switch.natural_show_adapt_color_living_room`: Enable or disable color adaptation 🌈 for supported lights.
<!-- SECTION:features:END -->

<!-- SECTION:manual-control:START -->
### :control_knobs: Regain Manual Control

Natural Show is designed to automatically detect when you or another source (e.g., automation) manually changes light settings 🕹️.
When this occurs, the affected light is marked as "manually controlled," and Natural Show will not make further adjustments until the light is turned off and back on or reset using the `natural_show.set_manual_control` service call.
This feature is available when `take_over_control` is enabled.

Additionally, enabling `detect_non_ha_changes` allows Natural Show to detect all state changes, including those made outside of Home Assistant, by comparing the light's state to its previously used settings.
The `natural_show.manual_control` event is fired when a light is marked as "manually controlled," allowing for integration with automations 🤖.

> ⚠️ **_Caution: Some lights might falsely indicate an 'on' state, which could result in lights turning on unexpectedly. Disable `detect_non_ha_changes` if you encounter such issues._**
<!-- SECTION:manual-control:END -->

## :books: Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [:gear: Configuration](#gear-configuration)
  - [:memo: Options](#memo-options)
  - [:hammer_and_wrench: Services](#hammer_and_wrench-services)
    - [`natural_show.apply`](#natural_showapply)
    - [`natural_show.set_manual_control`](#natural_showset_manual_control)
    - [`natural_show.change_switch_settings`](#natural_showchange_switch_settings)
- [:robot: Automation examples](#robot-automation-examples)
- [Additional Information](#additional-information)
- [:sos: Troubleshooting](#sos-troubleshooting)
  - [:exclamation: Common Problems & Solutions](#exclamation-common-problems--solutions)
    - [:bulb: Lights Not Responding or Turning On by Themselves](#bulb-lights-not-responding-or-turning-on-by-themselves)
    - [:signal_strength: WiFi Networks](#signal_strength-wifi-networks)
    - [:spider_web: Zigbee, Z-Wave, and Other Mesh Networks](#spider_web-zigbee-z-wave-and-other-mesh-networks)
    - [:rainbow: Light Colors Not Matching](#rainbow-light-colors-not-matching)
    - [:bulb: Bulb-Specific Issues](#bulb-bulb-specific-issues)
- [:bar_chart: Graphs!](#bar_chart-graphs)
  - [:sunny: Sun Position](#sunny-sun-position)
  - [:thermometer: Color Temperature](#thermometer-color-temperature)
  - [:high_brightness: Brightness](#high_brightness-brightness)
  - [While using `transition_until_sleep: true`](#while-using-transition_until_sleep-true)
  - [Custom brightness ramps using `brightness_mode` with `"linear"` and `"tanh"`](#custom-brightness-ramps-using-brightness_mode-with-linear-and-tanh)
- [:eyes: See also](#eyes-see-also)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## :gear: Configuration

Natural Show supports configuration through both YAML and the frontend (**Settings** -> **Devices and Services** -> **Natural Show**, **Natural Show** -> **Options**), with identical option names in both methods.

```yaml
# Example configuration.yaml entry
natural_show:
  lights:
    - light.living_room_lights
```
Note: If you plan to strictly use the UI, the `natural_show:` entry must still be added to the YAML.

Transform your home's atmosphere with Natural Show 🏠, and experience the benefits of intelligent, sun-synchronized lighting today!

### :memo: Options

All of the configuration options are listed below, along with their default values.
The YAML and frontend configuration methods support all of the options listed below.

<!-- CODE:START -->
<!-- from natural_show._docs_helpers import generate_config_markdown_table -->
<!-- print(generate_config_markdown_table()) -->
<!-- CODE:END -->

<!-- OUTPUT:START -->
<!-- ⚠️ This content is auto-generated by `markdown-code-runner`. -->
| Variable name                  | Description                                                                                                                                                                                                                                                                                                                                                                                   | Default        | Type                                    |
|:-------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:---------------|:----------------------------------------|
| `lights`                       | List of light entity_ids to be controlled (may be empty). 🌟                                                                                                                                                                                                                                                                                                                                  | `[]`           | list of `entity_id`s                    |
| `interval`                     | Frequency to adapt the lights, in seconds. 🔄                                                                                                                                                                                                                                                                                                                                                 | `90`           | `int > 0`                               |
| `transition`                   | Duration of transition when lights change, in seconds. 🕑                                                                                                                                                                                                                                                                                                                                     | `45`           | `float` 0-6553                          |
| `initial_transition`           | Duration of the first transition when lights turn from `off` to `on` in seconds. ⏲️                                                                                                                                                                                                                                                                                                           | `1`            | `float` 0-6553                          |
| `min_brightness`               | Minimum brightness percentage. 💡                                                                                                                                                                                                                                                                                                                                                             | `1`            | `int` 1-100                             |
| `max_brightness`               | Maximum brightness percentage. 💡                                                                                                                                                                                                                                                                                                                                                             | `100`          | `int` 1-100                             |
| `min_color_temp`               | Warmest color temperature in Kelvin. 🔥                                                                                                                                                                                                                                                                                                                                                       | `2000`         | `int` 1000-10000                        |
| `max_color_temp`               | Coldest color temperature in Kelvin. ❄️                                                                                                                                                                                                                                                                                                                                                       | `5500`         | `int` 1000-10000                        |
| `prefer_rgb_color`             | Whether to prefer RGB color adjustment over light color temperature when possible. 🌈                                                                                                                                                                                                                                                                                                         | `False`        | `bool`                                  |
| `sleep_brightness`             | Brightness percentage of lights in sleep mode. 😴                                                                                                                                                                                                                                                                                                                                             | `1`            | `int` 1-100                             |
| `sleep_rgb_or_color_temp`      | Use either `"rgb_color"` or `"color_temp"` in sleep mode. 🌙                                                                                                                                                                                                                                                                                                                                  | `color_temp`   | one of `['color_temp', 'rgb_color']`    |
| `sleep_color_temp`             | Color temperature in sleep mode (used when `sleep_rgb_or_color_temp` is `color_temp`) in Kelvin. 😴                                                                                                                                                                                                                                                                                           | `1000`         | `int` 1000-10000                        |
| `sleep_rgb_color`              | RGB color in sleep mode (used when `sleep_rgb_or_color_temp` is "rgb_color"). 🌈                                                                                                                                                                                                                                                                                                              | `[255, 56, 0]` | RGB color                               |
| `sleep_transition`             | Duration of transition when "sleep mode" is toggled in seconds. 😴                                                                                                                                                                                                                                                                                                                            | `1`            | `float` 0-6553                          |
| `transition_until_sleep`       | When enabled, Natural Show will treat sleep settings as the minimum, transitioning to these values after sunset. 🌙                                                                                                                                                                                                                                                                      | `False`        | `bool`                                  |
| `sunrise_time`                 | Set a fixed time (HH:MM:SS) for sunrise. 🌅                                                                                                                                                                                                                                                                                                                                                   | `None`         | `str`                                   |
| `min_sunrise_time`             | Set the earliest virtual sunrise time (HH:MM:SS), allowing for later sunrises. 🌅                                                                                                                                                                                                                                                                                                             | `None`         | `str`                                   |
| `max_sunrise_time`             | Set the latest virtual sunrise time (HH:MM:SS), allowing for earlier sunrises. 🌅                                                                                                                                                                                                                                                                                                             | `None`         | `str`                                   |
| `sunrise_offset`               | Adjust sunrise time with a positive or negative offset in seconds. ⏰                                                                                                                                                                                                                                                                                                                         | `0`            | `int`                                   |
| `sunset_time`                  | Set a fixed time (HH:MM:SS) for sunset. 🌇                                                                                                                                                                                                                                                                                                                                                    | `None`         | `str`                                   |
| `min_sunset_time`              | Set the earliest virtual sunset time (HH:MM:SS), allowing for later sunsets. 🌇                                                                                                                                                                                                                                                                                                               | `None`         | `str`                                   |
| `max_sunset_time`              | Set the latest virtual sunset time (HH:MM:SS), allowing for earlier sunsets. 🌇                                                                                                                                                                                                                                                                                                               | `None`         | `str`                                   |
| `sunset_offset`                | Adjust sunset time with a positive or negative offset in seconds. ⏰                                                                                                                                                                                                                                                                                                                          | `0`            | `int`                                   |
| `brightness_mode`              | Brightness mode to use. Possible values are `default`, `linear`, and `tanh` (uses `brightness_mode_time_dark` and `brightness_mode_time_light`). 📈                                                                                                                                                                                                                                           | `default`      | one of `['default', 'linear', 'tanh']`  |
| `brightness_mode_time_dark`    | (Ignored if `brightness_mode='default'`) The duration in seconds to ramp up/down the brightness before/after sunrise/sunset. 📈📉                                                                                                                                                                                                                                                             | `900`          | `int`                                   |
| `brightness_mode_time_light`   | (Ignored if `brightness_mode='default'`) The duration in seconds to ramp up/down the brightness after/before sunrise/sunset. 📈📉.                                                                                                                                                                                                                                                            | `3600`         | `int`                                   |
| `take_over_control`            | Pause adaptation of individual lights and hand over (manual) control to other sources that issue `light.turn_on` calls for lights that are on. 🔒                                                                                                                                                                                                                                             | `True`         | `bool`                                  |
| `take_over_control_mode`       | The adaptation pausing mode when other sources change brightness and/or color of lights. `pause_all` always pauses both brightness and color adaptation. `pause_changed` pauses the adaptation of only the changed attributes and continues adapting unchanged attributes, e.g., continues color adaptation when only brightness was changed.                                                 | `pause_all`    | one of `['pause_all', 'pause_changed']` |
| `detect_non_ha_changes`        | Detects and halts adaptations for non-`light.turn_on` state changes. Needs `take_over_control` enabled. 🕵️ Caution: ⚠️ Some lights might falsely indicate an 'on' state, which could result in lights turning on unexpectedly. Note that this calls `homeassistant.update_entity` every `interval`! Disable this feature if you encounter such issues.                                        | `False`        | `bool`                                  |
| `autoreset_control_seconds`    | Automatically reset the manual control after a number of seconds. Set to 0 to disable. ⏲️                                                                                                                                                                                                                                                                                                     | `0`            | `int` 0-31536000                        |
| `only_once`                    | Adapt lights only when they are turned on (`true`) or keep adapting them (`false`). 🔄                                                                                                                                                                                                                                                                                                        | `False`        | `bool`                                  |
| `adapt_only_on_bare_turn_on`   | When turning lights on initially. If set to `true`, AL adapts only if `light.turn_on` is invoked without specifying color or brightness. ❌🌈 This e.g., prevents adaptation when activating a scene and marks the light as manually controlled. If `false`, AL adapts regardless of the presence of color or brightness in the initial `service_data`. Needs `take_over_control` enabled. 🕵️ | `False`        | `bool`                                  |
| `separate_turn_on_commands`    | Use separate `light.turn_on` calls for color and brightness, needed for some light types. 🔀                                                                                                                                                                                                                                                                                                  | `False`        | `bool`                                  |
| `send_split_delay`             | Delay (ms) between `separate_turn_on_commands` for lights that don't support simultaneous brightness and color setting. ⏲️                                                                                                                                                                                                                                                                    | `0`            | `int` 0-10000                           |
| `adapt_delay`                  | Wait time (seconds) between light turn on and Natural Show applying changes. Might help to avoid flickering. ⏲️                                                                                                                                                                                                                                                                          | `0`            | `float > 0`                             |
| `skip_redundant_commands`      | Skip sending adaptation commands whose target state already equals the light's known state. Minimizes network traffic and improves the adaptation responsivity in some situations. 📉Disable if physical light states get out of sync with HA's recorded state.                                                                                                                               | `False`        | `bool`                                  |
| `intercept`                    | Intercept and adapt `light.turn_on` calls to enabling instantaneous color and brightness adaptation. 🏎️ Disable for lights that do not support `light.turn_on` with color and brightness.                                                                                                                                                                                                     | `True`         | `bool`                                  |
| `multi_light_intercept`        | Intercept and adapt `light.turn_on` calls that target multiple lights. ➗⚠️ This might result in splitting up a single `light.turn_on` call into multiple calls, e.g., when lights are in different switches. Requires `intercept` to be enabled.                                                                                                                                             | `True`         | `bool`                                  |
| `include_config_in_attributes` | Show all options as attributes on the switch in Home Assistant when set to `true`. 📝                                                                                                                                                                                                                                                                                                         | `False`        | `bool`                                  |

<!-- OUTPUT:END -->

<!-- SECTION:config-example-full:START -->
Full example:

```yaml
# Example configuration.yaml entry
natural_show:
- name: "default"
  lights: []
  prefer_rgb_color: false
  transition: 45
  initial_transition: 1
  interval: 90
  min_brightness: 1
  max_brightness: 100
  min_color_temp: 2000
  max_color_temp: 5500
  sleep_brightness: 1
  sleep_color_temp: 1000
  sunrise_time: "08:00:00"  # override the sunrise time
  sunrise_offset:
  sunset_time:
  sunset_offset: 1800  # in seconds or '00:30:00'
  take_over_control: true
  detect_non_ha_changes: false
  only_once: false

```
<!-- SECTION:config-example-full:END -->

### :hammer_and_wrench: Services

#### `natural_show.apply`

`natural_show.apply` applies Natural Show settings to lights on demand.

<!-- CODE:START -->
<!-- from natural_show._docs_helpers import generate_apply_markdown_table -->
<!-- print(generate_apply_markdown_table()) -->
<!-- CODE:END -->

<!-- OUTPUT:START -->
<!-- ⚠️ This content is auto-generated by `markdown-code-runner`. -->
| Service data attribute   | Description                                                                           | Required   | Type                 |
|:-------------------------|:--------------------------------------------------------------------------------------|:-----------|:---------------------|
| `entity_id`              | The `entity_id` of the switch with the settings to apply. 📝                          | ✅         | list of `entity_id`s |
| `lights`                 | A light (or list of lights) to apply the settings to. 💡                              | ❌         | list of `entity_id`s |
| `transition`             | Duration of transition when lights change, in seconds. 🕑                             | ❌         | `float` 0-6553       |
| `adapt_brightness`       | Whether to adapt the brightness of the light. 🌞                                      | ❌         | bool                 |
| `adapt_color`            | Whether to adapt the color on supporting lights. 🌈                                   | ❌         | bool                 |
| `prefer_rgb_color`       | Whether to prefer RGB color adjustment over light color temperature when possible. 🌈 | ❌         | bool                 |
| `turn_on_lights`         | Whether to turn on lights that are currently off. 🔆                                  | ❌         | bool                 |

<!-- OUTPUT:END -->
#### `natural_show.set_manual_control`

`natural_show.set_manual_control` can mark (or unmark) whether a light is "manually controlled", meaning that when a light has `manual_control`, the light is not adapted.

<!-- CODE:START -->
<!-- from natural_show._docs_helpers import generate_set_manual_control_markdown_table -->
<!-- print(generate_set_manual_control_markdown_table()) -->
<!-- CODE:END -->

<!-- OUTPUT:START -->
<!-- ⚠️ This content is auto-generated by `markdown-code-runner`. -->
| Service data attribute   | Description                                                                                                                                                            | Required   | Type                                     |
|:-------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|:-----------|:-----------------------------------------|
| `entity_id`              | The `entity_id` of the switch in which to (un)mark the light as being `manually controlled`. 📝                                                                        | ✅         | list of `entity_id`s                     |
| `lights`                 | entity_id(s) of lights, if not specified, all lights in the switch are selected. 💡                                                                                    | ❌         | list of `entity_id`s                     |
| `manual_control`         | Whether to add ("true") or remove ("false") all adapted attributes of the light from the "manual_control" list, or the name of an attribute for selective addition. 🔒 | ❌         | bool or one of `['brightness', 'color']` |

<!-- OUTPUT:END -->

<!-- SECTION:change-switch-settings:START -->
#### `natural_show.change_switch_settings`

`natural_show.change_switch_settings` (new in 1.7.0) Change any of the above configuration options of Natural Show (such as `sunrise_time` or `prefer_rgb_color`) with a service call directly from your script/automation.

> [!WARNING]
> These settings will **not** be written to your config and will be reset on restart of Home Assistant! You can see the current settings in the `switch.natural_show_XXX` attributes if `include_config_in_attributes` is enabled.

| Service data attribute                                    | Required | Description                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `use_defaults`                                            | ❌        | (default: `current` for current settings) Choose from `factory`, `configuration`, or `current` to reset variables not being set with this service call. `current` leaves them as they are, `configuration` resets to initial startup values, `factory` resets to default values listed in the documentation. |
| **all other keys** (except the ones in the table below ⚠️) | ❌        | See the table below for disallowed keys.                                                                                                                                                                                                                                                                     |

The following keys are disallowed:

| **DISALLOWED** service data | Description                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `entity_id`                 | You cannot change the switch's `entity_id`, as it has already been registered.                  |
| `lights`                    | You may call `natural_show.apply` with your lights or create a new config instead.         |
| `name`                      | You can rename your switch's display name in Home Assistant's UI.                               |
| `interval`                  | The interval is used only once when the config loads. A config change and restart are required. |
<!-- SECTION:change-switch-settings:END -->

<!-- SECTION:automation-examples:START -->
## :robot: Automation examples

<details markdown="1">
<summary>Reset the <code>manual_control</code> status of a light after an hour.</summary>

```yaml
- alias: "Natural Show: reset manual_control after 1 hour"
  mode: parallel
  trigger:
    platform: event
    event_type: natural_show.manual_control
  variables:
    light: "{{ trigger.event.data.entity_id }}"
    switch: "{{ trigger.event.data.switch }}"
  action:
    - delay: "01:00:00"
    - condition: template
      value_template: "{{ light in state_attr(switch, 'manual_control') }}"
    - service: natural_show.set_manual_control
      data:
        entity_id: "{{ switch }}"
        lights: "{{ light }}"
        manual_control: false
```

</details>

<details markdown="1">
<summary>Toggle multiple Natural Show switches to "sleep mode" using an <code>input_boolean.sleep_mode</code>.</summary>

```yaml
- alias: "Natural Show: toggle 'sleep mode'"
  trigger:
    - platform: state
      entity_id: input_boolean.sleep_mode
    - platform: homeassistant
      event: start  # in case the states aren't properly restored
  variables:
    sleep_mode: "{{ states('input_boolean.sleep_mode') }}"
  action:
    service: "switch.turn_{{ sleep_mode }}"
    entity_id:
      - switch.natural_show_sleep_mode_living_room
      - switch.natural_show_sleep_mode_bedroom
```

Set your sunrise and sunset time based on your alarm. The below script sets sunset_time exactly 12 hours after the custom sunrise time.

```yaml
iphone_carly_wakeup:
  alias: iPhone Carly Wakeup
  sequence:
    - condition: state
      entity_id: input_boolean.carly_iphone_wakeup
      state: "off"
    - service: input_datetime.set_datetime
      target:
        entity_id: input_datetime.carly_iphone_wakeup
      data:
        time: '{{ now().strftime("%H:%M:%S") }}'
    - service: input_boolean.turn_on
      target:
        entity_id: input_boolean.carly_iphone_wakeup
    - repeat:
        count: >
          {{ (states.switch
              | map(attribute="entity_id")
              | select(">","switch.natural_show_al_")
              | select("<", "switch.natural_show_al_z")
              | join(",")
             ).split(",") | length }}
        sequence:
          - service: natural_show.change_switch_settings
            data:
              entity_id: switch.natural_show_al_den_ceilingfan_lights
              sunrise_time: '{{ now().strftime("%H:%M:%S") }}'
              sunset_time: >
                {{ (as_timestamp(now()) + 12*60*60) | timestamp_custom("%H:%M:%S") }}
    - service: script.turn_on
      target:
        entity_id: script.run_wakeup_routine
    - service: input_boolean.turn_off
      target:
        entity_id:
          - input_boolean.carly_iphone_winddown
          - input_boolean.carly_iphone_bedtime
    - service: input_datetime.set_datetime
      target:
        entity_id: input_datetime.wakeup_time
      data:
        time: '{{ now().strftime("%H:%M:%S") }}'
    - service: script.natural_show_disable_sleep_mode
  mode: queued
  icon: mdi:weather-sunset
  max: 10
```

</details>
<!-- SECTION:automation-examples:END -->

## Additional Information

For configuration details and service usage, see the [official documentation](https://github.com/Ctrlable/natural-show#readme).

## :sos: Troubleshooting

<!-- SECTION:troubleshooting-intro:START -->
Encountering issues? Enable debug logging in your `configuration.yaml`:

```yaml
logger:
  default: warning
  logs:
    custom_components.natural_show: debug
```

After the issue occurs, create a new issue report with the log (`/config/home-assistant.log`).
<!-- SECTION:troubleshooting-intro:END -->

<!-- SECTION:common-problems:START -->
### :exclamation: Common Problems & Solutions

#### :bulb: Lights Not Responding or Turning On by Themselves

Natural Show sends more commands to lights than a typical human user would. If your light control network is unhealthy, you may experience:

- Laggy manual commands (e.g., turning lights on or off).
- Unresponsive lights.
- Home Assistant reporting incorrect light states, causing Natural Show to inadvertently turn lights back on.

Most issues that appear to be caused by Natural Show are actually due to unrelated problems.
Addressing these issues will significantly improve your Home Assistant experience.

In case lights are suddenly turning on by themselves, this is most likely due to the light incorrectly reporting an "on" state to Home Assistant, leading to an undesired Natural Show action.
To prevent adapting in cases *where the state of the light is suddenly "on" and only adapt if there is an associated `light.turn_on` service call*, set `detect_non_ha_changes: false`.

#### :signal_strength: WiFi Networks

Ensure your light bulbs have a strong WiFi connection. If the signal strength is less than -70dBm, the connection may be weak and prone to dropping messages.

#### :spider_web: Zigbee, Z-Wave, and Other Mesh Networks

Mesh networks typically require powered devices to act as routers, relaying messages back to the central coordinator (the radio connected to Home Assistant).
Most modern lights function as routers, very early models may not.
If devices become unresponsive or fail to respond to commands, Natural Show can exacerbate the issue.
Use network maps (available in ZHA, zigbee2mqtt, deCONZ, and ZWaveJS UI) to evaluate your network health.
Smart plugs can be an affordable way to add more routers to your network.

For most Zigbee networks, **using groups is essential for optimal performance**.
For example, if you want to use Natural Show in a hallway with six bulbs, adding each bulb individually to the Natural Show configuration could overwhelm the network with commands.
Instead, create a group in your Zigbee software (not a regular Home Assistant group) and add that single group to the Natural Show configuration.
This sends a single broadcast command to adjust all bulbs, improving response times and keeping the bulbs in sync.

As a rule of thumb, if you always control lights together (e.g., bulbs in a ceiling fixture), they should be in a Zigbee group.
Expose only the group (not individual bulbs) in Home Assistant Dashboards and external systems like Google Home or Apple HomeKit.

> :warning: **If you control lights individually, `manual_control` cannot behave correctly! If you need to control lights individually as well, use a [Home Assistant Light Group](https://www.home-assistant.io/integrations/group/).**

#### :rainbow: Light Colors Not Matching

Bulbs from different manufacturers or models may have varying color temperature specifications. For instance, if you have two Natural Show configurations—one with only Philips Hue White Ambiance bulbs and another with a mix of Philips Hue White Ambiance and Sengled bulbs—the Philips Hue bulbs may appear to have different color temperatures despite having identical settings.

To resolve this:

1.  Include only bulbs of the same make and model in a single Natural Show configuration.
2.  Rearrange bulbs so that different color temperatures are not visible simultaneously.

#### :bulb: Bulb-Specific Issues

These lights are known to exhibit disadvantageous behaviour due to firmware bugs, insufficient functionality, or hardware limitations:

- [Sengled Z01-A19NAE26](https://www.zigbee2mqtt.io/devices/Z01-A19NAE26.html#sengled-z01-a19nae26)
  - Unexpected turn-ons: If Natural Show sends a long transition time (like the default 45 seconds), and the bulb is turned off during that time, it may turn back on after approximately 10 seconds to continue the transition command. Since the bulb is turning itself on, there will be no obvious trigger in Home Assistant or other logs indicating the cause of the light turning on. To fix this, set a much shorter `transition` time, such as 1 second.
  - Heat sensitivity: Additionally, these bulbs may perform poorly in enclosed "dome" style ceiling lights, particularly when hot. While most LEDs (even non-smart ones) state in the fine print that they do not support working in enclosed fixtures, in practice, more expensive bulbs like Philips Hue generally perform better. To resolve this issue, move the problematic bulbs to open-air fixtures.
- Ikea Tradfri bulbs/drivers (and related Ikea smart light products)
  - Unsupported simultaneous transition of brightness and color: When receiving such a command, they switch the brightness instantly and only transition the color. To get smooth transitions of both brightness and color, enable `separate_turn_on_commands`.
  - Unresponsiveness during color transitions: No other commands are processed during an ongoing color transition, e.g., turn-off commands are ignored and lights stay on despite being reported as off to Home Assistant. The default config with long transitions thus results in long periods of unresponsiveness. To work around this, disable transitions by setting `transition` to `0`, and increase the adaptation frequency by setting `interval` to a short time, e.g., `15` seconds, to retain the impression of smooth continuous adaptations. Keeping the `initial_transition` is recommended for a smooth fade-in (lights are usually not turned off momentarily after being turned on, in which case a short period of unresponsiveness is tolerable).
<!-- SECTION:common-problems:END -->


<!-- SECTION:brightness-modes:START -->
### Custom brightness ramps using `brightness_mode` with `"linear"` and `"tanh"`

<details markdown="1">
<summary>Enhance your control over brightness transitions during sunrise and sunset with <code>brightness_mode</code> (click here to learn more 🧠).</summary>

With Natural Show, you can set a `brightness_mode` to specify how the brightness changes during sunrise and sunset. The `brightness_mode` can be set to `"default"` ([as illustrated in other graphs above](#high_brightness-brightness)), `"linear"`, or `"tanh"`. If you choose to deviate from the `"default"` mode, you can adjust `brightness_mode_time_dark` and `brightness_mode_time_light` to further customize the lighting transitions.

When `brightness_mode` is set to `"linear"`:

- During **_sunset_**, the brightness begins to gradually decrease from `max_brightness` starting at `time=sunset_time - brightness_mode_time_light`, until it reaches `min_brightness` at `time=sunset_time + brightness_mode_time_dark`.
- During **_sunrise_**, the brightness begins to gradually increase from `min_brightness` starting at `time=sunrise_time - brightness_mode_time_dark`, until it reaches `max_brightness` at `time=sunrise_time + brightness_mode_time_light`.

When `brightness_mode` is set to `"tanh"`, it uses the smooth transition of a [hyperbolic tangent function](https://mathworld.wolfram.com/HyperbolicTangent.html):

- During **_sunset_**, the brightness starts to decrease from 95% of `max_brightness` starting at `time=sunset_time - brightness_mode_time_light`, until it reaches 5% of `min_brightness` at `time=sunset_time + brightness_mode_time_dark`.
- During **_sunrise_**, the brightness starts to increase from 5% of `min_brightness` starting at `time=sunrise_time - brightness_mode_time_dark`, until it reaches 95% of `max_brightness` at `time=sunrise_time + brightness_mode_time_light`.
</details>

Notice the values of `brightness_mode_time_light` and `brightness_mode_time_dark` in the text box.

> Check out the interactive webapp on https://ctrlable.github.io/natural-show/ to play with the parameters and see how the brightness changes!
<!-- SECTION:brightness-modes:END -->



