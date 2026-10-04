#!/usr/bin/env python3
"""每天自动备份 TZ/CHZ/moonstone 三个工作台的服务器共享数据（server_data.json + accounts.json）。

由 launchd（com.aya.workbench.backup.plist）每天定时调用，也可以手动运行一次做即时备份：
    python3 backup_workbenches.py

备份存放在每个工作台目录下的 backups/<YYYY-MM-DD>/ 里，自动保留最近 KEEP_DAYS 天，更早的自动清理。
"""
import datetime
import json
import os
import shutil
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKBENCHES = ['TZ-工作台', 'CHZ-工作台', 'moonstone-工作台']
KEEP_DAYS = 30


def backup_one(workbench_name):
    wb_dir = os.path.join(BASE_DIR, workbench_name)
    data_file = os.path.join(wb_dir, 'server_data.json')
    if not os.path.exists(data_file):
        print(f'[{workbench_name}] 没有 server_data.json，跳过')
        return

    today = datetime.date.today().isoformat()
    dest_dir = os.path.join(wb_dir, 'backups', today)
    os.makedirs(dest_dir, exist_ok=True)

    for fname in ('server_data.json', 'accounts.json'):
        src = os.path.join(wb_dir, fname)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dest_dir, fname))

    # 附件（合同PDF/证照等）是单独存成文件的，文件名是随机值、上传后不会再被改动——所以不用每天整个复制一份，
    # 只往 backups/attachments/ 里补还没有的文件就行（这个目录名不是日期，不会被下面的过期清理动到）。
    att_src = os.path.join(wb_dir, 'attachments')
    if os.path.isdir(att_src):
        att_dst = os.path.join(wb_dir, 'backups', 'attachments')
        os.makedirs(att_dst, exist_ok=True)
        for fname in os.listdir(att_src):
            dst = os.path.join(att_dst, fname)
            if not os.path.exists(dst):
                shutil.copy2(os.path.join(att_src, fname), dst)

    print(f'[{workbench_name}] 已备份到 {dest_dir}')
    prune_old_backups(wb_dir)


def prune_old_backups(wb_dir):
    backups_dir = os.path.join(wb_dir, 'backups')
    if not os.path.isdir(backups_dir):
        return
    cutoff = datetime.date.today() - datetime.timedelta(days=KEEP_DAYS)
    for name in os.listdir(backups_dir):
        path = os.path.join(backups_dir, name)
        if not os.path.isdir(path):
            continue
        try:
            day = datetime.date.fromisoformat(name)
        except ValueError:
            continue
        if day < cutoff:
            shutil.rmtree(path, ignore_errors=True)
            print(f'  清理过期备份：{path}')


def main():
    print(f'--- 工作台数据备份开始 {datetime.datetime.now().isoformat()} ---')
    for wb in WORKBENCHES:
        try:
            backup_one(wb)
        except Exception as err:
            print(f'[{wb}] 备份失败：{err}', file=sys.stderr)
    print('--- 备份结束 ---')


if __name__ == '__main__':
    main()
