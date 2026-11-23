#!/usr/bin/env python3
"""Forced SSH command: accepts only Lighthouse configuration on stdin."""
import json
import os
import sys
import tempfile
from pathlib import Path

directory = Path('/opt/lighthouse/runtime')
allowed = {'MONGODB_URI', 'MQTT_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD', 'MQTT_CA_CERT', 'API_TOKEN', 'LAB_AI_URL', 'LAB_AI_TOKEN'}
required = allowed - {'MQTT_CA_CERT', 'LAB_AI_URL', 'LAB_AI_TOKEN'}
try:
    raw = sys.stdin.buffer.read(65537)
    if len(raw) > 65536:
        raise ValueError()
    config = json.loads(raw)
    if not isinstance(config, dict) or set(config) - allowed:
        raise ValueError()
    if any(not isinstance(v, str) for v in config.values()):
        raise ValueError()
    if any(not config.get(k) for k in required):
        raise ValueError()
    fd, name = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(config, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o444)
        os.replace(name, directory / 'runtime.json')
    finally:
        if os.path.exists(name):
            os.unlink(name)
except Exception:
    sys.exit('Invalid runtime configuration or unavailable destination')
print('Configuration installed')
