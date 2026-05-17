export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job ${id} 를 찾을 수 없습니다`);
    this.name = 'JobNotFoundError';
  }
}

export class JobNotRetryableError extends Error {
  constructor(status: string) {
    super(`FAILED 상태인 Job만 재시도할 수 있습니다. 현재 상태: ${status}`);
    this.name = 'JobNotRetryableError';
  }
}
