---
name: Bug Report
about: Report a bug in natural-show.
title: ''
labels: kind/bug, kind/feature, need/triage
assignees: ''

---

# Home Assistant Natural Show Issue Template

## Bug Reports

If you need help with using or configuring Natural Show, please [open a Q&A discussion thread here](https://github.com/Ctrlable/natural-show/discussions/new?category=q-a) instead.

### Before submitting a bug report, please follow these troubleshooting steps:

Please confirm that you have completed the following steps:

- [ ] I have updated to the [latest Natural Show version](https://github.com/Ctrlable/natural-show/releases) available in [HACS](https://hacs.xyz/).
- [ ] I have reviewed the [Troubleshooting Section](https://github.com/Ctrlable/natural-show#sos-troubleshooting) in the [README](https://github.com/Ctrlable/natural-show#readme).
- [ ] (If using Zigbee2MQTT) I have read the [Zigbee2MQTT troubleshooting guide](https://github.com/Ctrlable/natural-show#zigbee2mqtt) in the [README](https://github.com/Ctrlable/natural-show#readme).
- [ ] I have checked the [V2 Roadmap](https://github.com/Ctrlable/natural-show/discussions/291) and [open issues](https://github.com/Ctrlable/natural-show/issues) to ensure my issue isn't a duplicate.


### Required information for bug reports:

Please include the following information in your issue.

*Issues missing this information may not be addressed.*

1.  **Debug logs** captured while the issue occurred. [See here for instructions on enabling debug logging](https://github.com/Ctrlable/natural-show#troubleshooting):

```

```

2.  [Your Natural Show configuration](https://github.com/Ctrlable/natural-show#gear-configuration):

```

```

3.  (If using Zigbee2MQTT), provide your configuration files (**remove all personal information before posting**):
    - `devices.yaml`
    - `groups.yaml`
    - `configuration.yaml` ⚠️; **Warning** _**REMOVE ALL of the PERSONAL INFORMATION BELOW before posting**_ ⚠️;
      - mqtt: `server`:
      - mqtt: `user`:
      - mqtt: `password`:
      - advanced: `pan_id`:
      - advanced: `network_key`:
      - anything in `log_syslog` if you use this
    - Brand and model number of problematic light(s)
```

```

4.  Describe the bug and how to reproduce it:



5. Steps to reproduce the behavior:
