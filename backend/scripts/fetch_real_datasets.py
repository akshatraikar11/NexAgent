#!/usr/bin/env python3
"""
NexAgent — Real Dataset Ingestion & Testing Script
Fetches real data samples from verified open sources:
  1. Incidents: danluu/post-mortems (GitHub)
  2. System Logs: logpai/loghub (Linux & Windows 2k system logs)
  3. Public IT Tickets: Mozilla Bugzilla REST API
  4. Hugging Face: Bitext Customer Support Dataset sample
"""
import os
import sys
import json
import urllib.request
from pathlib import Path

# Fix Windows console UTF-8 output
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "external"
DATA_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {'User-Agent': 'NexAgent-Academic-Research/1.0'}

def fetch_danluu_postmortems():
    print("[1/4] Fetching real incident post-mortems from danluu/post-mortems...")
    url = "https://raw.githubusercontent.com/danluu/post-mortems/master/README.md"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode('utf-8')
        
        lines = content.split('\n')
        incidents = []
        for line in lines:
            if line.strip().startswith("[") and "](" in line and "http" in line:
                company = line.split("](")[0].replace("[", "").strip()
                description = line.split(").", 1)[-1].strip() if ")." in line else line.strip()
                incidents.append({"company": company, "incident_summary": description, "raw": line.strip()})
                if len(incidents) >= 30:
                    break
                    
        out_file = DATA_DIR / "danluu_incidents_sample.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(incidents, f, indent=2)
        print(f"  [OK] Saved {len(incidents)} real incident post-mortems to data/external/danluu_incidents_sample.json")
    except Exception as e:
        print(f"  [FAIL] Failed: {e}")

def fetch_loghub_system_logs():
    print("[2/4] Fetching real system logs from logpai/loghub (Linux syslog)...")
    url_linux = "https://raw.githubusercontent.com/logpai/loghub/master/Linux/Linux_2k.log"
    try:
        req = urllib.request.Request(url_linux, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            log_lines = resp.read().decode('utf-8', errors='ignore').splitlines()[:50]
        
        out_file = DATA_DIR / "loghub_linux_sample.log"
        with open(out_file, "w", encoding="utf-8") as f:
            f.write("\n".join(log_lines))
        print(f"  [OK] Saved {len(log_lines)} real Linux syslog lines to data/external/loghub_linux_sample.log")
    except Exception as e:
        print(f"  [FAIL] Failed: {e}")

def fetch_bugzilla_tickets():
    print("[3/4] Fetching real public IT/bug tickets from Mozilla Bugzilla API...")
    url = "https://bugzilla.mozilla.org/rest/bug?limit=20&bug_status=RESOLVED&include_fields=id,summary,status,resolution,component,priority"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        
        bugs = data.get("bugs", [])
        out_file = DATA_DIR / "bugzilla_tickets_sample.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(bugs, f, indent=2)
        print(f"  [OK] Saved {len(bugs)} real tickets from Bugzilla to data/external/bugzilla_tickets_sample.json")
    except Exception as e:
        print(f"  [FAIL] Failed: {e}")

def fetch_bitext_sample():
    print("[4/4] Fetching Bitext Customer Support Dataset sample from Hugging Face...")
    url = "https://datasets-server.huggingface.co/rows?dataset=bitext%2FBitext-customer-support-llm-chatbot-training-dataset&config=default&split=train&offset=0&limit=25"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        rows = [r["row"] for r in data.get("rows", [])]
        out_file = DATA_DIR / "bitext_support_sample.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2)
        print(f"  [OK] Saved {len(rows)} real support tickets from Bitext to data/external/bitext_support_sample.json")
    except Exception as e:
        print(f"  [FAIL] Hugging Face note: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("NexAgent: Fetching Real Benchmark Datasets")
    print("=" * 60)
    fetch_danluu_postmortems()
    fetch_loghub_system_logs()
    fetch_bugzilla_tickets()
    fetch_bitext_sample()
    print("=" * 60)
    print("All available external datasets downloaded to backend/data/external/")
