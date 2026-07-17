// 스케줄링은 apps/workers/scheduler Lambda (EventBridge rate: 1m)가 담당합니다.
// 이 서비스는 더 이상 사용되지 않습니다.
import { Injectable } from '@nestjs/common';

@Injectable()
export class SchedulerService {}
