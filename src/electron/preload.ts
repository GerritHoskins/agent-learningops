import { contextBridge, ipcRenderer } from 'electron'
import { learningOpsIpcChannels, type LearningOpsRendererApi } from './ipc-contract.js'

const learningOps: LearningOpsRendererApi = {
    selectRepository: () => ipcRenderer.invoke(learningOpsIpcChannels.selectRepository),
    openRepository: (input) => ipcRenderer.invoke(learningOpsIpcChannels.openRepository, input),
    switchRepository: (input) => ipcRenderer.invoke(learningOpsIpcChannels.switchRepository, input),
    closeRepository: () => ipcRenderer.invoke(learningOpsIpcChannels.closeRepository),
    getSnapshot: () => ipcRenderer.invoke(learningOpsIpcChannels.getSnapshot),
    importMarkdown: (input) => ipcRenderer.invoke(learningOpsIpcChannels.importMarkdown, input),
    clusterLearnings: () => ipcRenderer.invoke(learningOpsIpcChannels.clusterLearnings),
    proposeLearnings: () => ipcRenderer.invoke(learningOpsIpcChannels.proposeLearnings),
    recordProposalDecision: (input) => ipcRenderer.invoke(learningOpsIpcChannels.recordProposalDecision, input),
    previewPatch: (input) => ipcRenderer.invoke(learningOpsIpcChannels.previewPatch, input),
    exportMarkdown: (input) => ipcRenderer.invoke(learningOpsIpcChannels.exportMarkdown, input),
}

contextBridge.exposeInMainWorld('learningOps', learningOps)
