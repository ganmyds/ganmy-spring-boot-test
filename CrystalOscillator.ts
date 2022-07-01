interface TaskOptions {
    leading?: boolean, 
    edging?: boolean, 
    timeout?: number, 
    timeoutCallback?: () => void 
}
interface TimerHolder {
    label: string | number | object,
    timerHandle: number
    options: TaskOptions
    task: () => void
}

/**
 * 定时器
 */
class CrystalOscillator {
    private timerHolders: TimerHolder[] = []
    
    /**
     * 开始执行定时任务
     * @param label 任务标签 
     * @param task 任务方法
     * @param interval 间隔时间
     */
    public startTask(label: string | number | object, task: () => void, interval: number, options?: TaskOptions): void {
        if (this.timerHolders.some(th => th.label == label)) {
            throw new Error("Dumplicate label")
        }
        if (options == undefined) {
            options = {}
        }
        if (options.leading) {
            task()
        }
        let holder = setInterval(task, interval)
        let timeoutCallback
        if(options.timeout) {
            let originalCallback = options.timeoutCallback
            timeoutCallback = () => {
                this.stopTask(label)
                if(originalCallback) {
                    originalCallback()
                }
            }
            setTimeout(timeoutCallback, options.timeout);
        }
        this.timerHolders.push({
            label: label,
            timerHandle: holder,
            options,
            task
        })
    }

    /**
     * 停止执行任务
     * @param label 任务标签
     */
    public stopTask(label: string | number | object) {
        let timerHolder = this.timerHolders.find(th => th.label == label)
        if (timerHolder) {
            clearInterval(timerHolder.timerHandle)
            if(timerHolder.options.edging) {
                timerHolder.task()
            }
        }
        this.timerHolders = this.timerHolders.filter(th => th.label != label)
    }
}

export let crystalOscillator = new CrystalOscillator()