#!/usr/bin/env python3
"""
远程触发 Jenkins 任务的脚本
"""

import requests
import sys
import urllib3

# 禁用 SSL 警告（如果需要）
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Jenkins 配置
JENKINS_URL = "https://jenkins.wiac.xyz"  # 使用 HTTPS
API_TOKEN = "111f01ba54158756ac7abfd84f1947a988"
JOB_NAME = "SeleniumBaseCi-AutoTest"
USERNAME = "root"  # 默认用户名，如需修改请调整

# 任务参数
SCRIPT_PATHS = "examples/wordle_test.py"  # 多个脚本用逗号分隔
MARKER = "smoke"  # 标记名称，根据需要修改

def normalize_url(url):
    """
    规范化 URL，确保使用正确的域名前缀
    """
    if not url:
        return url
    
    # 如果 URL 已经是完整的 https://jenkins.wiac.xyz 开头，直接返回
    if url.startswith(JENKINS_URL):
        return url
    
    # 如果是相对路径（以 / 开头），直接拼接
    if url.startswith('/'):
        return f"{JENKINS_URL}{url}"
    
    # 如果包含其他域名或协议，替换为正确的域名
    # 移除任何现有的协议和域名部分，保留路径
    if '://' in url:
        # 提取路径部分（从第一个 / 开始，在域名之后）
        path_start = url.find('/', url.find('://') + 3)
        if path_start != -1:
            path = url[path_start:]
            return f"{JENKINS_URL}{path}"
    
    return f"{JENKINS_URL}/{url}"

def trigger_jenkins_job(script_paths, marker=""):
    """
    触发 Jenkins 任务
    
    Args:
        script_paths: 脚本路径，多个用逗号分隔
        marker: pytest marker 标记
    """
    
    # 构建请求 URL
    build_url = f"{JENKINS_URL}/job/{JOB_NAME}/buildWithParameters"
    
    # 构建参数
    params = {
        "SCRIPT_PATHS": script_paths,
        "MARKER": marker
    }
    
    print(f"🚀 开始触发 Jenkins 任务...")
    print(f"   Jenkins URL: {JENKINS_URL}")
    print(f"   任务名称: {JOB_NAME}")
    print(f"   脚本路径: {script_paths}")
    print(f"   Marker: {marker}")
    print()
    
    try:
        # 获取 CSRF 令牌
        crumb_url = f"{JENKINS_URL}/crumbIssuer/api/json"
        crumb_response = requests.get(
            crumb_url,
            auth=(USERNAME, API_TOKEN),
            timeout=10,
            verify=False
        )
        
        headers = {}
        if crumb_response.status_code == 200:
            crumb_data = crumb_response.json()
            field_name = crumb_data.get('crumbRequestField')
            crumb_value = crumb_data.get('crumb')
            headers[field_name] = crumb_value
        
        # 发送请求
        response = requests.post(
            build_url,
            data=params,
            auth=(USERNAME, API_TOKEN),
            headers=headers,
            timeout=10,
            verify=False
        )
        
        # 检查响应状态
        if response.status_code == 201:
            print("✅ 任务触发成功！")
            
            # 尝试获取构建队列位置
            location = response.headers.get('Location')
            if location:
                # 规范化 URL
                queue_url = normalize_url(location)
                print(f"   构建队列位置: {queue_url}")
                
                # 尝试从队列获取构建信息
                try:
                    queue_info = requests.get(
                        f"{queue_url}/api/json?tree=cancelled,executable[url]",
                        auth=(USERNAME, API_TOKEN),
                        timeout=10,
                        verify=False
                    )
                    if queue_info.status_code == 200:
                        queue_data = queue_info.json()
                        if queue_data.get('executable'):
                            build_url_from_queue = queue_data['executable'].get('url')
                            if build_url_from_queue:
                                # 规范化 URL
                                full_build_url = normalize_url(build_url_from_queue)
                                print(f"   实际构建 URL: {full_build_url}")
                except:
                    pass
            
            # 获取最新构建信息
            get_url = f"{JENKINS_URL}/job/{JOB_NAME}/lastBuild/api/json"
            try:
                build_info = requests.get(
                    get_url,
                    auth=(USERNAME, API_TOKEN),
                    timeout=10,
                    verify=False
                )
                if build_info.status_code == 200:
                    data = build_info.json()
                    build_number = data.get('number')
                    build_url_value = data.get('url')
                    
                    print(f"   构建号: {build_number}")
                    
                    # 规范化 URL
                    if build_url_value:
                        full_url = normalize_url(build_url_value)
                        print(f"   构建 URL: {full_url}")
            except:
                pass
            
        elif response.status_code == 200:
            print("✅ 任务已提交！")
            print(f"   响应: {response.text}")
            
        else:
            print(f"❌ 触发失败，状态码: {response.status_code}")
            print(f"   响应内容: {response.text}")
            return False
            
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"❌ 请求失败: {str(e)}")
        return False

def get_job_status():
    """
    获取任务的最新构建状态
    """
    print("\n📊 获取任务状态...")
    
    try:
        url = f"{JENKINS_URL}/job/{JOB_NAME}/api/json"
        response = requests.get(
            url,
            auth=(USERNAME, API_TOKEN),
            timeout=10,
            verify=False
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"   任务名称: {data.get('displayName')}")
            print(f"   描述: {data.get('description')}")
            
            last_build = data.get('lastBuild')
            if last_build:
                print(f"   最后构建号: {last_build.get('number')}")
                last_build_url = last_build.get('url')
                if last_build_url:
                    # 规范化 URL
                    full_last_build_url = normalize_url(last_build_url)
                    print(f"   最后构建 URL: {full_last_build_url}")
            
            return True
        else:
            print(f"❌ 获取状态失败: {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ 请求失败: {str(e)}")
        return False

if __name__ == "__main__":
    # 支持命令行参数
    if len(sys.argv) > 1:
        script_paths = sys.argv[1]
    else:
        script_paths = SCRIPT_PATHS
    
    if len(sys.argv) > 2:
        marker = sys.argv[2]
    else:
        marker = MARKER
    
    # 触发任务
    success = trigger_jenkins_job(script_paths, marker)
    
    if success:
        # 获取任务状态
        get_job_status()
        print("\n✨ 操作完成！")
    else:
        print("\n❌ 操作失败！")
        sys.exit(1)