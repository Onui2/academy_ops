"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  HardDrive,
  Users,
  Activity,
  Wifi,
  Shield,
  Archive,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Upload,
  Server,
  Database,
  FolderOpen,
  Settings,
  FileText,
} from "lucide-react"
import { useState } from "react"

interface DashboardContentProps {
  activeSection: string
}

export function DashboardContent({ activeSection }: DashboardContentProps) {
  if (activeSection === "overview") {
    return <OverviewDashboard />
  }

  if (activeSection === "storage") {
    return <StorageManagement />
  }

  if (activeSection === "files") {
    return <FileManagement />
  }

  if (activeSection === "users") {
    return <UserManagement />
  }

  if (activeSection === "network") {
    return <NetworkSettings />
  }

  if (activeSection === "backup") {
    return <BackupManagement />
  }

  if (activeSection === "services") {
    return <ServiceStatus />
  }

  if (activeSection === "database") {
    return <DatabaseManagement />
  }

  if (activeSection === "security") {
    return <SecuritySettings />
  }

  return (
    <div className="flex-1 p-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{getSectionTitle(activeSection)}</h2>
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <p className="text-gray-500 text-center">{activeSection} 섹션의 상세 내용이 여기에 표시됩니다.</p>
        </div>
      </div>
    </div>
  )
}

function getSectionTitle(section: string): string {
  const titles: Record<string, string> = {
    overview: "대시보드 개요",
    storage: "스토리지 관리", 
    files: "파일 관리",
    users: "사용자 관리",
    network: "네트워크 설정",
    backup: "백업 관리",
    services: "서비스 상태",
    database: "데이터베이스",
    security: "보안 설정",
    logs: "시스템 로그",
    settings: "시스템 설정"
  }
  return titles[section] || section
}

function OverviewDashboard() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">NAS 대시보드</h1>
            <p className="text-gray-500 mt-1">시스템 상태와 주요 기능을 한눈에 확인하세요</p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle className="w-3 h-3 mr-1" />
              정상 운영중
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 스토리지</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">8.5TB</div>
              <Progress value={85} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">85% 사용중 (7.2TB / 8.5TB)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">활성 사용자</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-muted-foreground">+2 지난 시간 대비</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">네트워크 상태</CardTitle>
              <Wifi className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">양호</div>
              <div className="flex items-center space-x-2 mt-1">
                <div className="flex items-center text-xs text-muted-foreground">
                  <Download className="w-3 h-3 mr-1" />
                  125 Mbps
                </div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <Upload className="w-3 h-3 mr-1" />
                  89 Mbps
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">시스템 부하</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">23%</div>
              <Progress value={23} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">CPU 사용률</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>빠른 작업</CardTitle>
              <CardDescription>자주 사용하는 기능들</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start bg-transparent" variant="outline">
                <FolderOpen className="w-4 h-4 mr-2" />
                파일 업로드
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                <Users className="w-4 h-4 mr-2" />
                사용자 추가
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                <Archive className="w-4 h-4 mr-2" />
                백업 시작
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                <Shield className="w-4 h-4 mr-2" />
                보안 검사
              </Button>
            </CardContent>
          </Card>

          {/* System Services */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>시스템 서비스</CardTitle>
              <CardDescription>주요 서비스 상태</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Server className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium">파일 서버</p>
                      <p className="text-sm text-gray-500">SMB/CIFS, NFS</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    실행중
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Database className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium">데이터베이스</p>
                      <p className="text-sm text-gray-500">MySQL, PostgreSQL</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    실행중
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Archive className="w-5 h-5 text-yellow-600" />
                    <div>
                      <p className="font-medium">백업 서비스</p>
                      <p className="text-sm text-gray-500">자동 백업 진행중</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                    진행중
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Wifi className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-medium">웹 서버</p>
                      <p className="text-sm text-gray-500">Nginx, Apache</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    실행중
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Storage Details and Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Storage Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>스토리지 상세</CardTitle>
              <CardDescription>디스크별 사용량</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>시스템 디스크 (SSD)</span>
                  <span>45% (450GB / 1TB)</span>
                </div>
                <Progress value={45} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>데이터 디스크 1 (HDD)</span>
                  <span>89% (3.6TB / 4TB)</span>
                </div>
                <Progress value={89} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>데이터 디스크 2 (HDD)</span>
                  <span>78% (3.1TB / 4TB)</span>
                </div>
                <Progress value={78} />
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>최근 활동</CardTitle>
              <CardDescription>시스템 로그 요약</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">백업 완료</p>
                    <p className="text-xs text-gray-500">사용자 데이터 백업이 성공적으로 완료되었습니다</p>
                    <p className="text-xs text-gray-400">2분 전</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">디스크 용량 경고</p>
                    <p className="text-xs text-gray-500">데이터 디스크 1의 사용량이 85%를 초과했습니다</p>
                    <p className="text-xs text-gray-400">15분 전</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">사용자 로그인</p>
                    <p className="text-xs text-gray-500">admin 사용자가 웹 인터페이스에 로그인했습니다</p>
                    <p className="text-xs text-gray-400">1시간 전</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Clock className="w-4 h-4 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">시스템 업데이트</p>
                    <p className="text-xs text-gray-500">보안 패치가 설치되었습니다</p>
                    <p className="text-xs text-gray-400">3시간 전</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StorageManagement() {
  const storageDevices = [
    {
      id: "nas-01",
      name: "메인 NAS 서버",
      location: "192.168.1.100",
      totalCapacity: "12TB",
      usedCapacity: "8.5TB",
      freeCapacity: "3.5TB",
      usagePercent: 71,
      status: "healthy",
      disks: [
        { name: "시스템 SSD", capacity: "1TB", used: "450GB", percent: 45, health: "excellent", type: "SSD" },
        { name: "데이터 HDD 1", capacity: "4TB", used: "3.6TB", percent: 90, health: "good", type: "HDD" },
        { name: "데이터 HDD 2", capacity: "4TB", used: "3.1TB", percent: 78, health: "good", type: "HDD" },
        { name: "데이터 HDD 3", capacity: "4TB", used: "1.4TB", percent: 35, health: "excellent", type: "HDD" },
      ],
    },
    {
      id: "nas-02",
      name: "백업 NAS 서버",
      location: "192.168.1.101",
      totalCapacity: "8TB",
      usedCapacity: "4.2TB",
      freeCapacity: "3.8TB",
      usagePercent: 53,
      status: "healthy",
      disks: [
        { name: "시스템 SSD", capacity: "500GB", used: "180GB", percent: 36, health: "excellent", type: "SSD" },
        { name: "백업 HDD 1", capacity: "4TB", used: "2.1TB", percent: 53, health: "good", type: "HDD" },
        { name: "백업 HDD 2", capacity: "4TB", used: "1.9TB", percent: 48, health: "excellent", type: "HDD" },
      ],
    },
    {
      id: "nas-03",
      name: "미디어 NAS 서버",
      location: "192.168.1.102",
      totalCapacity: "16TB",
      usedCapacity: "12.8TB",
      freeCapacity: "3.2TB",
      usagePercent: 80,
      status: "warning",
      disks: [
        { name: "시스템 SSD", capacity: "1TB", used: "320GB", percent: 32, health: "excellent", type: "SSD" },
        { name: "미디어 HDD 1", capacity: "8TB", used: "6.4TB", percent: 80, health: "good", type: "HDD" },
        { name: "미디어 HDD 2", capacity: "8TB", used: "6.1TB", percent: 76, health: "fair", type: "HDD" },
      ],
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-600 bg-green-50 border-green-200"
      case "warning":
        return "text-yellow-600 bg-yellow-50 border-yellow-200"
      case "error":
        return "text-red-600 bg-red-50 border-red-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const getHealthColor = (health: string) => {
    switch (health) {
      case "excellent":
        return "text-green-600"
      case "good":
        return "text-blue-600"
      case "fair":
        return "text-yellow-600"
      case "poor":
        return "text-red-600"
      default:
        return "text-gray-600"
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">스토리지 관리</h1>
            <p className="text-gray-500 mt-1">모든 NAS 서버의 스토리지 상태를 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <HardDrive className="w-4 h-4 mr-2" />새 볼륨 추가
          </Button>
        </div>

        {/* Storage Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 스토리지</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">36TB</div>
              <p className="text-xs text-muted-foreground">3개 NAS 서버</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">사용중</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">25.5TB</div>
              <p className="text-xs text-muted-foreground">전체의 71%</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">사용 가능</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">10.5TB</div>
              <p className="text-xs text-muted-foreground">여유 공간</p>
            </CardContent>
          </Card>
        </div>

        {/* NAS Servers */}
        <div className="space-y-6">
          {storageDevices.map((nas) => (
            <Card key={nas.id} className="overflow-hidden">
              <CardHeader className="bg-gray-50 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                      <Server className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{nas.name}</CardTitle>
                      <CardDescription className="flex items-center space-x-4">
                        <span>{nas.location}</span>
                        <Badge className={getStatusColor(nas.status)}>
                          {nas.status === "healthy" ? "정상" : nas.status === "warning" ? "주의" : "오류"}
                        </Badge>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{nas.usedCapacity}</div>
                    <div className="text-sm text-gray-500">/ {nas.totalCapacity}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>전체 사용량</span>
                    <span>{nas.usagePercent}%</span>
                  </div>
                  <Progress value={nas.usagePercent} className="h-2" />
                </div>
              </CardHeader>

              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {nas.disks.map((disk, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <HardDrive className={`w-4 h-4 ${disk.type === "SSD" ? "text-blue-500" : "text-gray-500"}`} />
                          <span className="font-medium text-sm">{disk.name}</span>
                        </div>
                        <Badge variant="outline" className={`text-xs ${getHealthColor(disk.health)}`}>
                          {disk.health === "excellent"
                            ? "최상"
                            : disk.health === "good"
                              ? "양호"
                              : disk.health === "fair"
                                ? "보통"
                                : "불량"}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">사용량</span>
                          <span>
                            {disk.used} / {disk.capacity}
                          </span>
                        </div>
                        <Progress value={disk.percent} className="h-1" />
                        <div className="text-xs text-gray-500 text-center">{disk.percent}% 사용중</div>
                      </div>

                      <div className="mt-3 flex space-x-1">
                        <Button variant="outline" size="sm" className="flex-1 text-xs bg-transparent">
                          관리
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 text-xs bg-transparent">
                          검사
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex justify-end space-x-2">
                  <Button variant="outline" size="sm">
                    <Activity className="w-4 h-4 mr-1" />
                    성능 모니터링
                  </Button>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-1" />
                    RAID 설정
                  </Button>
                  <Button variant="outline" size="sm">
                    <Archive className="w-4 h-4 mr-1" />
                    백업 설정
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function FileManagement() {
  const [currentPath, setCurrentPath] = useState("/")
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])

  const fileStructure = [
    { name: "Documents", type: "folder", size: "-", modified: "2024-01-15", permissions: "rwxr-xr-x" },
    { name: "Media", type: "folder", size: "-", modified: "2024-01-14", permissions: "rwxr-xr-x" },
    { name: "Backup", type: "folder", size: "-", modified: "2024-01-13", permissions: "rwxr-xr-x" },
    { name: "config.txt", type: "file", size: "2.4 KB", modified: "2024-01-12", permissions: "rw-r--r--" },
    { name: "system.log", type: "file", size: "156 MB", modified: "2024-01-11", permissions: "rw-r--r--" },
    { name: "database.sql", type: "file", size: "45.2 MB", modified: "2024-01-10", permissions: "rw-------" },
  ]

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">파일 관리</h1>
            <p className="text-gray-500 mt-1">NAS 서버의 파일과 폴더를 관리합니다</p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              업로드
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <FolderOpen className="w-4 h-4 mr-2" />새 폴더
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>파일 브라우저</CardTitle>
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <span>경로: {currentPath}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fileStructure.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg border">
                    <div className="flex items-center space-x-3">
                      {item.type === "folder" ? (
                        <FolderOpen className="w-5 h-5 text-blue-500" />
                      ) : (
                        <FileText className="w-5 h-5 text-gray-500" />
                      )}
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-500">{item.permissions}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{item.size}</span>
                      <span>{item.modified}</span>
                      <Button variant="ghost" size="sm">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>파일 작업</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start bg-transparent" variant="outline">
                <Download className="w-4 h-4 mr-2" />
                다운로드
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                <Archive className="w-4 h-4 mr-2" />
                압축
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                <Shield className="w-4 h-4 mr-2" />
                권한 설정
              </Button>
              <Button className="w-full justify-start bg-transparent" variant="outline">
                <Activity className="w-4 h-4 mr-2" />
                공유 설정
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function UserManagement() {
  const users = [
    {
      id: 1,
      username: "admin",
      name: "관리자",
      email: "admin@nas.local",
      role: "Administrator",
      status: "active",
      lastLogin: "2024-01-15 14:30",
    },
    {
      id: 2,
      username: "john",
      name: "John Doe",
      email: "john@company.com",
      role: "User",
      status: "active",
      lastLogin: "2024-01-15 09:15",
    },
    {
      id: 3,
      username: "jane",
      name: "Jane Smith",
      email: "jane@company.com",
      role: "User",
      status: "active",
      lastLogin: "2024-01-14 16:45",
    },
    {
      id: 4,
      username: "backup",
      name: "백업 계정",
      email: "backup@nas.local",
      role: "Service",
      status: "inactive",
      lastLogin: "2024-01-10 02:00",
    },
  ]

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">사용자 관리</h1>
            <p className="text-gray-500 mt-1">NAS 시스템의 사용자 계정을 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Users className="w-4 h-4 mr-2" />새 사용자 추가
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">총 사용자</p>
                  <p className="text-2xl font-bold">12</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">활성 사용자</p>
                  <p className="text-2xl font-bold text-green-600">9</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">관리자</p>
                  <p className="text-2xl font-bold">2</p>
                </div>
                <Shield className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">온라인</p>
                  <p className="text-2xl font-bold text-blue-600">5</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>사용자 목록</CardTitle>
            <CardDescription>등록된 모든 사용자 계정</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-gray-500">
                        @{user.username} • {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Badge variant={user.status === "active" ? "default" : "secondary"}>
                      {user.status === "active" ? "활성" : "비활성"}
                    </Badge>
                    <Badge variant="outline">{user.role}</Badge>
                    <div className="text-sm text-gray-500">
                      <p>마지막 로그인</p>
                      <p>{user.lastLogin}</p>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function NetworkSettings() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">네트워크 설정</h1>
            <p className="text-gray-500 mt-1">NAS 서버의 네트워크 구성을 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Wifi className="w-4 h-4 mr-2" />
            설정 저장
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>네트워크 인터페이스</CardTitle>
              <CardDescription>활성 네트워크 연결</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg bg-green-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Wifi className="w-5 h-5 text-green-600" />
                    <span className="font-medium">eth0 (기본)</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">연결됨</Badge>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>IP 주소: 192.168.1.100</p>
                  <p>서브넷 마스크: 255.255.255.0</p>
                  <p>게이트웨이: 192.168.1.1</p>
                  <p>속도: 1000 Mbps</p>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Wifi className="w-5 h-5 text-gray-400" />
                    <span className="font-medium">eth1 (백업)</span>
                  </div>
                  <Badge variant="secondary">비활성</Badge>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>IP 주소: 192.168.2.100</p>
                  <p>서브넷 마스크: 255.255.255.0</p>
                  <p>게이트웨이: 192.168.2.1</p>
                  <p>속도: 1000 Mbps</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>DNS 설정</CardTitle>
              <CardDescription>도메인 이름 서버 구성</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">기본 DNS</label>
                <input className="w-full p-2 border rounded" defaultValue="8.8.8.8" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">보조 DNS</label>
                <input className="w-full p-2 border rounded" defaultValue="8.8.4.4" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">도메인 이름</label>
                <input className="w-full p-2 border rounded" defaultValue="nas.local" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>방화벽 설정</CardTitle>
              <CardDescription>네트워크 보안 규칙</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">SSH (포트 22)</p>
                  <p className="text-sm text-gray-500">원격 관리 접속</p>
                </div>
                <Badge className="bg-green-100 text-green-800">허용</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">HTTP (포트 80)</p>
                  <p className="text-sm text-gray-500">웹 인터페이스</p>
                </div>
                <Badge className="bg-green-100 text-green-800">허용</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">SMB (포트 445)</p>
                  <p className="text-sm text-gray-500">파일 공유</p>
                </div>
                <Badge className="bg-green-100 text-green-800">허용</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>네트워크 상태</CardTitle>
              <CardDescription>실시간 네트워크 통계</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>다운로드 속도</span>
                  <span>125.4 Mbps</span>
                </div>
                <Progress value={75} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>업로드 속도</span>
                  <span>89.2 Mbps</span>
                </div>
                <Progress value={60} />
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-600">2.4TB</p>
                  <p className="text-sm text-gray-500">총 다운로드</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">1.8TB</p>
                  <p className="text-sm text-gray-500">총 업로드</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function BackupManagement() {
  const backupJobs = [
    {
      id: 1,
      name: "사용자 데이터 백업",
      source: "/home",
      destination: "NAS-02:/backup/users",
      schedule: "매일 02:00",
      status: "completed",
      lastRun: "2024-01-15 02:00",
      nextRun: "2024-01-16 02:00",
    },
    {
      id: 2,
      name: "시스템 설정 백업",
      source: "/etc",
      destination: "NAS-02:/backup/system",
      schedule: "매주 일요일",
      status: "running",
      lastRun: "2024-01-14 03:00",
      nextRun: "2024-01-21 03:00",
    },
    {
      id: 3,
      name: "데이터베이스 백업",
      source: "/var/lib/mysql",
      destination: "External:/backup/db",
      schedule: "매일 01:00",
      status: "failed",
      lastRun: "2024-01-15 01:00",
      nextRun: "2024-01-16 01:00",
    },
  ]

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">백업 관리</h1>
            <p className="text-gray-500 mt-1">자동 백업 작업을 설정하고 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Archive className="w-4 h-4 mr-2" />새 백업 작업
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">총 백업 작업</p>
                  <p className="text-2xl font-bold">8</p>
                </div>
                <Archive className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">성공</p>
                  <p className="text-2xl font-bold text-green-600">6</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">진행중</p>
                  <p className="text-2xl font-bold text-yellow-600">1</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">실패</p>
                  <p className="text-2xl font-bold text-red-600">1</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>백업 작업 목록</CardTitle>
            <CardDescription>설정된 모든 백업 작업</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {backupJobs.map((job) => (
                <div key={job.id} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <Archive className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="font-medium">{job.name}</p>
                        <p className="text-sm text-gray-500">
                          {job.source} → {job.destination}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        job.status === "completed" ? "default" : job.status === "running" ? "secondary" : "destructive"
                      }
                    >
                      {job.status === "completed" ? "완료" : job.status === "running" ? "진행중" : "실패"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                    <div>
                      <p className="font-medium">스케줄</p>
                      <p>{job.schedule}</p>
                    </div>
                    <div>
                      <p className="font-medium">마지막 실행</p>
                      <p>{job.lastRun}</p>
                    </div>
                    <div>
                      <p className="font-medium">다음 실행</p>
                      <p>{job.nextRun}</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-3">
                    <Button variant="outline" size="sm">
                      실행
                    </Button>
                    <Button variant="outline" size="sm">
                      편집
                    </Button>
                    <Button variant="outline" size="sm">
                      로그
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ServiceStatus() {
  const services = [
    { name: "파일 서버 (SMB)", status: "running", port: "445", uptime: "15일 3시간", cpu: "2.1%", memory: "156MB" },
    { name: "웹 서버 (Nginx)", status: "running", port: "80,443", uptime: "15일 3시간", cpu: "0.8%", memory: "45MB" },
    { name: "SSH 서버", status: "running", port: "22", uptime: "15일 3시간", cpu: "0.1%", memory: "12MB" },
    {
      name: "데이터베이스 (MySQL)",
      status: "running",
      port: "3306",
      uptime: "15일 3시간",
      cpu: "1.5%",
      memory: "512MB",
    },
    { name: "백업 서비스", status: "running", port: "-", uptime: "2시간 15분", cpu: "5.2%", memory: "89MB" },
    { name: "모니터링 (Prometheus)", status: "stopped", port: "9090", uptime: "-", cpu: "0%", memory: "0MB" },
  ]

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">서비스 상태</h1>
            <p className="text-gray-500 mt-1">시스템에서 실행 중인 모든 서비스를 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Activity className="w-4 h-4 mr-2" />
            전체 새로고침
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">총 서비스</p>
                  <p className="text-2xl font-bold">12</p>
                </div>
                <Server className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">실행중</p>
                  <p className="text-2xl font-bold text-green-600">10</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">중지됨</p>
                  <p className="text-2xl font-bold text-gray-600">2</p>
                </div>
                <Clock className="h-8 w-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">오류</p>
                  <p className="text-2xl font-bold text-red-600">0</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>서비스 목록</CardTitle>
            <CardDescription>시스템에서 실행 중인 모든 서비스</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {services.map((service, index) => (
                <div key={index} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-3 h-3 rounded-full ${service.status === "running" ? "bg-green-500" : "bg-gray-400"}`}
                      ></div>
                      <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-sm text-gray-500">포트: {service.port}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={service.status === "running" ? "default" : "secondary"}>
                        {service.status === "running" ? "실행중" : "중지됨"}
                      </Badge>
                      <Button variant="ghost" size="sm">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                    <div>
                      <p className="font-medium">가동 시간</p>
                      <p>{service.uptime}</p>
                    </div>
                    <div>
                      <p className="font-medium">CPU 사용률</p>
                      <p>{service.cpu}</p>
                    </div>
                    <div>
                      <p className="font-medium">메모리 사용량</p>
                      <p>{service.memory}</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-3">
                    {service.status === "running" ? (
                      <>
                        <Button variant="outline" size="sm">
                          재시작
                        </Button>
                        <Button variant="outline" size="sm">
                          중지
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm">
                        시작
                      </Button>
                    )}
                    <Button variant="outline" size="sm">
                      로그
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DatabaseManagement() {
  const databases = [
    { name: "nas_users", type: "MySQL", size: "45.2 MB", tables: 8, status: "active", lastBackup: "2024-01-15 02:00" },
    {
      name: "file_metadata",
      type: "PostgreSQL",
      size: "128.7 MB",
      tables: 12,
      status: "active",
      lastBackup: "2024-01-15 02:00",
    },
    { name: "system_logs", type: "MySQL", size: "2.1 GB", tables: 4, status: "active", lastBackup: "2024-01-15 02:00" },
    {
      name: "backup_catalog",
      type: "SQLite",
      size: "15.8 MB",
      tables: 3,
      status: "active",
      lastBackup: "2024-01-15 02:00",
    },
  ]

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">데이터베이스 관리</h1>
            <p className="text-gray-500 mt-1">NAS 시스템의 데이터베이스를 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Database className="w-4 h-4 mr-2" />새 데이터베이스
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">총 데이터베이스</p>
                  <p className="text-2xl font-bold">4</p>
                </div>
                <Database className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">총 크기</p>
                  <p className="text-2xl font-bold">2.3GB</p>
                </div>
                <HardDrive className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">활성 연결</p>
                  <p className="text-2xl font-bold">23</p>
                </div>
                <Activity className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">쿼리/초</p>
                  <p className="text-2xl font-bold">156</p>
                </div>
                <Server className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>데이터베이스 목록</CardTitle>
            <CardDescription>시스템에서 관리하는 모든 데이터베이스</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {databases.map((db, index) => (
                <div key={index} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Database className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="font-medium">{db.name}</p>
                        <p className="text-sm text-gray-500">
                          {db.type} • {db.tables}개 테이블
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="default">활성</Badge>
                      <Button variant="ghost" size="sm">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                    <div>
                      <p className="font-medium">크기</p>
                      <p>{db.size}</p>
                    </div>
                    <div>
                      <p className="font-medium">테이블 수</p>
                      <p>{db.tables}개</p>
                    </div>
                    <div>
                      <p className="font-medium">마지막 백업</p>
                      <p>{db.lastBackup}</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-3">
                    <Button variant="outline" size="sm">
                      백업
                    </Button>
                    <Button variant="outline" size="sm">
                      최적화
                    </Button>
                    <Button variant="outline" size="sm">
                      쿼리
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SecuritySettings() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">보안 설정</h1>
            <p className="text-gray-500 mt-1">NAS 시스템의 보안 정책을 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Shield className="w-4 h-4 mr-2" />
            보안 검사 실행
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">보안 점수</p>
                  <p className="text-2xl font-bold text-green-600">85/100</p>
                </div>
                <Shield className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">활성 규칙</p>
                  <p className="text-2xl font-bold">24</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">차단된 시도</p>
                  <p className="text-2xl font-bold text-red-600">156</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>방화벽 규칙</CardTitle>
              <CardDescription>네트워크 접근 제어</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                <div>
                  <p className="font-medium">SSH 접근 허용</p>
                  <p className="text-sm text-gray-500">포트 22, 관리자 네트워크만</p>
                </div>
                <Badge className="bg-green-100 text-green-800">활성</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                <div>
                  <p className="font-medium">웹 인터페이스</p>
                  <p className="text-sm text-gray-500">포트 80, 443</p>
                </div>
                <Badge className="bg-green-100 text-green-800">활성</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg bg-red-50">
                <div>
                  <p className="font-medium">외부 접근 차단</p>
                  <p className="text-sm text-gray-500">모든 외부 IP</p>
                </div>
                <Badge className="bg-red-100 text-red-800">차단</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>인증 설정</CardTitle>
              <CardDescription>사용자 인증 정책</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">최소 비밀번호 길이</label>
                <input className="w-full p-2 border rounded" defaultValue="8" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">로그인 시도 제한</label>
                <input className="w-full p-2 border rounded" defaultValue="5" />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" defaultChecked />
                <label className="text-sm">2단계 인증 강제</label>
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" defaultChecked />
                <label className="text-sm">세션 타임아웃 (30분)</label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SSL/TLS 인증서</CardTitle>
              <CardDescription>암호화 연결 관리</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 border rounded-lg bg-green-50">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">nas.local</p>
                  <Badge className="bg-green-100 text-green-800">유효</Badge>
                </div>
                <div className="text-sm text-gray-600">
                  <p>발급자: Let's Encrypt</p>
                  <p>만료일: 2024-04-15</p>
                </div>
              </div>
              <Button className="w-full bg-transparent" variant="outline">
                인증서 갱신
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>보안 로그</CardTitle>
              <CardDescription>최근 보안 이벤트</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">로그인 실패</p>
                  <p className="text-xs text-gray-500">192.168.1.50에서 5회 연속 실패</p>
                  <p className="text-xs text-gray-400">10분 전</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">관리자 로그인</p>
                  <p className="text-xs text-gray-500">admin 사용자 성공적 로그인</p>
                  <p className="text-xs text-gray-400">1시간 전</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Shield className="w-4 h-4 text-blue-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">방화벽 규칙 업데이트</p>
                  <p className="text-xs text-gray-500">새로운 차단 규칙 추가</p>
                  <p className="text-xs text-gray-400">2시간 전</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function getSectionTitle(section: string): string {
  const titles: Record<string, string> = {
    storage: "스토리지 관리",
    files: "파일 관리",
    users: "사용자 관리",
    network: "네트워크 설정",
    backup: "백업 관리",
    services: "서비스 상태",
    database: "데이터베이스",
    security: "보안 설정",
    logs: "시스템 로그",
    settings: "시스템 설정",
  }
  return titles[section] || "대시보드"
}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Badge 
                      variant={user.status === "active" ? "default" : "secondary"}
                      className={user.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                    >
                      {user.status === "active" ? "활성" : "비활성"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {user.role === "Administrator" ? "관리자" : user.role === "User" ? "사용자" : "서비스"}
                    </Badge>
                    <div className="text-sm text-gray-500">
                      마지막 로그인: {user.lastLogin}
                    </div>
                    <div className="flex space-x-1">
                      <Button variant="ghost" size="sm">
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Shield className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function NetworkSettings() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">네트워크 설정</h1>
            <p className="text-gray-500 mt-1">NAS 서버의 네트워크 구성을 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Wifi className="w-4 h-4 mr-2" />설정 저장
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>네트워크 인터페이스</CardTitle>
              <CardDescription>활성 네트워크 연결</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg bg-green-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Wifi className="w-5 h-5 text-green-600" />
                    <span className="font-medium">eth0 (기본)</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">연결됨</Badge>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>IP 주소: 192.168.1.100</p>
                  <p>서브넷 마스크: 255.255.255.0</p>
                  <p>게이트웨이: 192.168.1.1</p>
                  <p>DNS: 8.8.8.8, 8.8.4.4</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>방화벽 상태</CardTitle>
              <CardDescription>보안 설정</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>방화벽</span>
                  <Badge className="bg-green-100 text-green-800">활성</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>SSH 접근</span>
                  <Badge className="bg-blue-100 text-blue-800">허용</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>웹 인터페이스</span>
                  <Badge className="bg-blue-100 text-blue-800">허용</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function BackupManagement() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">백업 관리</h1>
            <p className="text-gray-500 mt-1">자동 백업 작업을 설정하고 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Archive className="w-4 h-4 mr-2" />새 백업 작업
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>진행중인 백업</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>사용자 데이터</span>
                  <span>75%</span>
                </div>
                <Progress value={75} />
                <p className="text-xs text-gray-500">예상 완료: 15분</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>마지막 백업</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="font-medium">성공</p>
                <p className="text-sm text-gray-500">2시간 전</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>백업 크기</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <Database className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <p className="font-medium">2.4TB</p>
                <p className="text-sm text-gray-500">총 백업 데이터</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ServiceStatus() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">서비스 상태</h1>
            <p className="text-gray-500 mt-1">시스템 서비스들의 상태를 모니터링합니다</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { name: "웹 서버", status: "running", port: "80, 443" },
            { name: "SSH 서버", status: "running", port: "22" },
            { name: "FTP 서버", status: "running", port: "21" },
            { name: "데이터베이스", status: "running", port: "3306" },
            { name: "백업 서비스", status: "running", port: "-" },
            { name: "모니터링", status: "stopped", port: "9090" },
          ].map((service, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">{service.name}</h3>
                  <Badge 
                    className={service.status === "running" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                  >
                    {service.status === "running" ? "실행중" : "중지됨"}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 mb-4">포트: {service.port}</p>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    {service.status === "running" ? "중지" : "시작"}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">재시작</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function DatabaseManagement() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">데이터베이스</h1>
            <p className="text-gray-500 mt-1">데이터베이스 서버를 관리합니다</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Database className="w-4 h-4 mr-2" />새 데이터베이스
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>데이터베이스 목록</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "nas_system", size: "45MB", tables: 12, status: "active" },
                { name: "user_data", size: "128MB", tables: 8, status: "active" },
                { name: "backup_logs", size: "23MB", tables: 3, status: "active" },
              ].map((db, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Database className="w-6 h-6 text-blue-500" />
                    <div>
                      <p className="font-medium">{db.name}</p>
                      <p className="text-sm text-gray-500">{db.tables}개 테이블 • {db.size}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-green-100 text-green-800">활성</Badge>
                    <Button variant="outline" size="sm">관리</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SecuritySettings() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">보안 설정</h1>
            <p className="text-gray-500 mt-1">시스템 보안을 관리합니다</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>접근 제어</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span>2단계 인증</span>
                <Badge className="bg-green-100 text-green-800">활성</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>IP 화이트리스트</span>
                <Badge className="bg-blue-100 text-blue-800">설정됨</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>자동 잠금</span>
                <Badge className="bg-green-100 text-green-800">활성</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>보안 로그</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Shield className="w-4 h-4 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">로그인 성공</p>
                    <p className="text-xs text-gray-500">admin - 192.168.1.50</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">의심스러운 접근 시도</p>
                    <p className="text-xs text-gray-500">192.168.1.200</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}