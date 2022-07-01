import Vue from 'vue'
import Vuex, { Commit, Store } from 'vuex'
import axios from "axios"
import { District } from '@/@types/District';
import { MapUrl } from '@/shared/map/MapUrl';
import { fetchDistricts } from '@/shared/district/districtUtil';
import { fetchMapUrl } from '@/shared/map/MapUtil';
import { PatrolGrid, fetchGrids } from '@/@types/patrol/grid/PatrolGrid';
import { GridChief, fetchGridChiefs } from '@/@types/patrol/grid/GridChief';
import { Pilot } from '@/@types/drone/Pilot';
import uri from 'urijs'
import { PatrolEvent, fetchPatrolEvent, PatrolEventState, savePatrolEvent, fetchPatrolEvents, PatrolEventSeverity, setCurrentEventIsEmergency } from '@/@types/patrol/grid/event/PatrolEvent';
import { fetchPatrolEventTasks, PatrolTask, savePatrolTask, FlightAirTraceTaskState, FlightAirTraceTask, GridChiefIdentificationTask, PatrolTaskState } from '@/@types/patrol/grid/task/PatrolTask';
import { PatrolEventDetailInfo } from './PatrolEventDetailInfo';
import { clone, last, flatMap } from "lodash"
import moment, { Moment } from "moment";
import { Camera } from '@/@types/camera/Camera';
import { PatrolEventSourceType } from '@/@types/patrol/grid/event/PatrolEventSource';
import { Page } from '@/@types/utility/Page';
import { PatrolEventsHighlightInfo, MapHighlightInfo, FlightAirTraceTaskHighlightInfo, MinThreshold } from './MapHighlightInfo';
import { fetchFlightAirTracesBySince } from '@/@types/attachment/FlightAirTrace';
import { FlightAirTrace } from '@/@types/attachment/FlightAirTrace';
import { stateToCN } from '@/@types/flight/FlightIssue';
import { crystalOscillator } from '@/shared/util/CrystalOscillator';
import { fetchEmergencyEvent, EmergencyEvent } from '@/@types/emergency/EmergencyEvent';
Vue.use(Vuex)

export interface PatrolEventProcessModuleState {
  districts: District[]
  districtPromise: Promise<District[]>
  mapUrl: MapUrl | null
  patrolGrids: PatrolGrid[]
  gridChiefs: GridChief[]
  pilots: Pilot[]
  currentTaskId: number | null
  cameras: Camera[]
  currentEventInfo: PatrolEventDetailInfo | null
  issuing: boolean
  // currentTask: PatrolTask | null
  flightIssuing: boolean
  videoUrl: string | null
  patrolEvents: PatrolEvent[]
  currentPatrolEvent: PatrolEvent | null
  searchParams: { districtCode: string, eventType: PatrolEventSourceType | "All", from: Moment | undefined, to: Moment | undefined; }
  rootDistrictCode: string
  mapHighlightInfo: MapHighlightInfo | null
  flightTraceTimeout: number | null
  minThreshold: MinThreshold | null,
  showChatGridChief: boolean,
  emergencyEvents: EmergencyEvent[]
}
let { eventId } = uri(location.href).query(true) as { eventId: string }
let districtPromise = fetchDistricts()

let store = new Vuex.Store<PatrolEventProcessModuleState>({
  state: {
    districts: <District[]>[],
    districtPromise: districtPromise,
    mapUrl: null,
    patrolGrids: [],
    gridChiefs: [],
    cameras: [],
    currentEventInfo: null,
    issuing: false,
    currentTaskId: null,
    pilots: [],
    flightIssuing: false,
    videoUrl: null,
    patrolEvents: [],
    currentPatrolEvent: null,
    searchParams: { districtCode: "350400", eventType: "All", from: undefined, to: undefined },
    rootDistrictCode: "350400",
    mapHighlightInfo: null,
    flightTraceTimeout: null,
    minThreshold: null,
    showChatGridChief: false,
    emergencyEvents: []
  },
  modules: {
  },
  getters: {
    districtList(state) {
      return flatMap(state.districts, (d => {
        return [d].concat(d.children)
      }))
    },
    patrolEventList(state) {
      let selectList = state.patrolEvents.filter((event: PatrolEvent) => {
        let isDistrict = true
        let isType = true
        if (state.searchParams.districtCode !== state.rootDistrictCode) {
          isDistrict = event.location.districtCode === state.searchParams.districtCode
        }
        if (state.searchParams.eventType !== "All") {
          isType = event.source.type === state.searchParams.eventType
        }
        return isDistrict && isType
      })
      return selectList
    },
    currentTask(state, getters) {
      if (state.currentTaskId == null || state.currentEventInfo == null) {
        return null;
      } else {
        let currentTask = state.currentEventInfo.eventTasks.find((task: PatrolTask) => {
          return task.id == state.currentTaskId
        })
        return currentTask || null
      }
    }
  },
  mutations: {
    init(state, param: {
      mapUrl: MapUrl,
      patrolGrids: PatrolGrid[],
      gridChiefs: GridChief[],
      cameras: Camera[],
      pilots: Pilot[],
      emergencyEvents: EmergencyEvent[]
    }) {
      state.mapUrl = param.mapUrl;
      state.patrolGrids = param.patrolGrids;
      state.gridChiefs = param.gridChiefs;
      state.pilots = param.pilots;
      state.cameras = param.cameras;
      state.emergencyEvents = param.emergencyEvents;
    },
    initDistricts(state, districts: District[]) {
      state.districts = districts;
    },
    selectEvent(state, info: PatrolEventDetailInfo | null) {
      state.currentEventInfo = info
    },
    updateEvent(state, event: PatrolEvent) {
      state.currentEventInfo!.event = event
    },
    appendTask(state, task: PatrolTask) {
      state.currentEventInfo!.eventTasks.push(task)
    },

    beginNewIssue(state) {
      state.issuing = true
    },
    cancelIssuing(state) {
      state.issuing = false
    },
    beginNewFlightIssue(state) {
      state.flightIssuing = true
    },
    cancelFlightIssuing(state) {
      state.flightIssuing = false
    },
    setCurrentTask(state, detail: PatrolTask | null) {
      state.currentTaskId = detail ? detail.id : null
    },
    searchEventList(state, param: { patrolEvents: Page<PatrolEvent> }) {
      state.patrolEvents = param.patrolEvents.data
    },
    mapHighlight(state, mapHighlightInfo: MapHighlightInfo) {
      state.mapHighlightInfo = mapHighlightInfo
    },
    updateVideoUrl(state, videoUrl: string | null) {
      state.videoUrl = videoUrl;
    },
    flightTraceTimeout(state, flightTraceTimeout: number) {
      state.flightTraceTimeout = flightTraceTimeout
    },
    setMinThreshold(state, minThreshold: MinThreshold) {
      state.minThreshold = minThreshold
    },
    setShowChatGridChief(state, isShow: boolean) {
      state.showChatGridChief = isShow
    },
    setCurrentPatrolEvent(state, currentPatrolEvents: PatrolEvent) {
      state.currentPatrolEvent = currentPatrolEvents
    },
    flightIssueTrace(state, flightTraces: FlightAirTrace[]) {
      let flightHighLight = <FlightAirTraceTaskHighlightInfo>state.mapHighlightInfo!;
      flightHighLight.traces = flightTraces
    },
    eventTasks(state, tasks: PatrolTask[]) {
      (<any>state.currentEventInfo).eventTasks = tasks
    }
  },
  actions: {
    async init({ commit, dispatch, state, getters }) {
      let mapUrl = await fetchMapUrl();
      let patrolGrids = await fetchGrids();
      let gridChiefs = await fetchGridChiefs();
      let cameras = await fetchCameras();
      let emergencyEvents = await fetchEmergencyEvent();
      commit("init", {
        mapUrl,
        patrolGrids,
        gridChiefs,
        cameras,
        emergencyEvents
      })
      await dispatch("loadEvent", eventId)
      dispatch("searchPatrolEvents", state.searchParams)
      crystalOscillator.startTask("refresh-event", async () => {
        dispatch("searchPatrolEvents", state.searchParams);
        dispatch("loadTasks", eventId)
      }, 1500)
    },
    async loadEvent({ commit, state, getters }, eventId) {
      await state.districtPromise
      let event = await fetchPatrolEvent(eventId)
      let tasks = await fetchPatrolEventTasks(eventId)
      let district = (getters.districtList as District[]).find(d => d.code == event.location.districtCode)!
      let grids = state.patrolGrids.filter(g => g.districtCode == event.location.districtCode)
      let currentEventInfo: PatrolEventDetailInfo = {
        event: event,
        eventTasks: tasks,
        eventDistrict: district,
        eventDistrictGrids: grids
      }
      commit("selectEvent", currentEventInfo)
      commit("setCurrentPatrolEvent", currentEventInfo.event)
    },
    async loadTasks({ commit, state, getters }, eventId) {
      let tasks = await fetchPatrolEventTasks(eventId)
      commit("eventTasks", tasks)
    },
    async setCurrentEventIsEmergency({ commit, state }, info: {
      level: number,
      catalogId: number,
      eventId: number
    }) {

      let restId = await setCurrentEventIsEmergency(info);
      //跳转
      window.location.href = "/emergency_overview?eventId=" + restId

      // return rest;
    },

    async beginProcess({ commit }, event: PatrolEvent) {
      let clonedEvent = cloneEvent(event)
      clonedEvent.state = PatrolEventState.PROCESSING
      clonedEvent.startProcessTime = moment().format("YYYY-MM-DDTHH:MM:ss")
      let savedEvent = await savePatrolEvent(clonedEvent)
      commit("updateEvent", savedEvent)
    },
    async completeEvent({ commit }, param: { event: PatrolEvent, conclusion: string }) {
      let clonedEvent = cloneEvent(param.event)
      clonedEvent.state = PatrolEventState.COMPLETE
      clonedEvent.completeTime = moment().format("YYYY-MM-DDTHH:MM:ss")
      clonedEvent.conclusion = param.conclusion
      let savedEvent = await savePatrolEvent(clonedEvent)
      commit("updateEvent", savedEvent)
    },
    async dispatchTask({ commit }, task: PatrolTask) {
      let savedTask = await savePatrolTask(task)
      commit("appendTask", savedTask)
    },
    async searchPatrolEvents({ commit, state, getters }, searchParams: { districtCode: string, eventType: PatrolEventSourceType | "All", from: Moment, to: Moment }) {
      let patrolEvents = await fetchPatrolEvents({ state: [PatrolEventState.NEW, PatrolEventState.PROCESSING], from: searchParams.from, to: searchParams.to }, {
        page: 1,
        pageSize: 100000
      })
      state.searchParams = searchParams
      commit("searchEventList", {
        patrolEvents
      })
      let patrolEventsHighLightInfo: PatrolEventsHighlightInfo = {
        highlightType: "patrol-events",
        patrolEvents: getters.patrolEventList,
        grids: state.patrolGrids
      }
      if (state.currentPatrolEvent == null) {
        commit("mapHighlight", patrolEventsHighLightInfo)
      }
    },
    async selectTask({ commit, state, getters, dispatch }, task: PatrolTask) {
      commit("updateVideoUrl", null)
      await dispatch("loadEvent", eventId)
      commit("setCurrentTask", task)
      if (task.type == "FlightAirTraceTask") {
        loadFlightTrace(task, state, commit)
      }
    },
    // async refreshTask({ commit, dispatch, state, getters }, currentTask: GridChiefIdentificationTask) {
    //   await dispatch("loadEvent", currentTask.eventId);
    //   let tasks = (<PatrolEventDetailInfo>state.currentEventInfo).eventTasks
    //   let newTask = tasks.find((task: PatrolTask) => {
    //     return task.id == currentTask.id && task.eventId == currentTask.eventId
    //   })
    //   await dispatch("selectTask", newTask);
    // }
  }
})

store.watch((state, getter) => getter.currentTask, async (currentTask: PatrolTask | null, previousTask: PatrolTask | null) => {
  let sameTask = isSameDataSourceInstance(currentTask, previousTask)
  if (sameTask == false) {
    if (previousTask && (previousTask.type == "FlightAirTraceTask" || previousTask.type == "FlightWaterSamplingTask")) {
      crystalOscillator.stopTask("flight_data_source_data_" + previousTask.id)
      store.commit("updateVideoUrl", null)
    }
    if (currentTask && (currentTask.type == "FlightAirTraceTask" || currentTask.type == "FlightWaterSamplingTask")) {
      if ((currentTask.state == PatrolTaskState.NEW || currentTask.state == PatrolTaskState.PROCESSING) && currentTask.flightState == FlightAirTraceTaskState.Flying) {
        crystalOscillator.startTask("flight_data_source_data_" + currentTask.id, async () => {
          let originalHighlightInfo = store.state.mapHighlightInfo;
          if (originalHighlightInfo != null && originalHighlightInfo.highlightType == "flight-air-trace") {
            let task = originalHighlightInfo.task;
            let allTraces = originalHighlightInfo.allTraces;
            let lastTrace = last(originalHighlightInfo.traces);
            let since = lastTrace === undefined ? null : lastTrace.timestamp;
            let tracesPromise = fetchFlightAirTracesBySince(task.id, since, 100);
            tracesPromise.then(traces => {
              let highlightInfo = getFlightAirTrace(task, true, traces, allTraces.concat(traces));
              store.commit("mapHighlight", highlightInfo);
            })
          }
        }, 1500)
      }
    } else {
      crystalOscillator.stopTask("flight_data_source_data_" + (<any>currentTask).id)
    }
  }

})

// function unloadFlightTrace(state: { flightTraceTimeout: null | number }) {
//   if (state.flightTraceTimeout) {
//     clearInterval(state.flightTraceTimeout)
//     state.flightTraceTimeout = null
//   }
// }

async function loadFlightTrace(task: FlightAirTraceTask, state: { mapHighlightInfo: MapHighlightInfo | null }, commit: Commit) {
  let traces = await fetchFlightAirTracesBySince(task.id, null, 1000000)
  let highlightInfo = getFlightAirTrace(task, false, traces, traces);
  commit("mapHighlight", highlightInfo);
}

function getFlightAirTrace(task: FlightAirTraceTask, ctn: boolean, traces: FlightAirTrace[], allTraces: FlightAirTrace[]): FlightAirTraceTaskHighlightInfo {
  let highlightInfo: FlightAirTraceTaskHighlightInfo = {
    highlightType: "flight-air-trace",
    continue: ctn,
    task: task,
    traces: traces,
    allTraces: allTraces
  }
  return highlightInfo
}

// 初始化获取所有摄像头
function fetchCameras() {
  let url = "/api/camera";
  return axios.get<Camera[]>(url)
    .then(response => {
      let allCameraList = response.data
      return allCameraList
    })
}

function cloneEvent(event: PatrolEvent) {
  let clonedEvent = clone(event)
  clonedEvent.location = clone(event.location)
  clonedEvent.source = clone(event.source)
  return clonedEvent
}
districtPromise.then(d => {
  store.commit("initDistricts", d)
})

// function setTask(store: Store<PatrolEventProcessModuleState>) {
//   let task = (state: { flight: PatrolEventProcessModuleState }, getters: { "selectedTask": PatrolTask | null }) => {
//     return getters["selectedTask"]
//   }
//   let callback = (value: PatrolTask | null, oldValue: PatrolTask | null) => {
//     let sameTask = isSameDataSourceInstance(value, oldValue)
//     if (sameTask == false) {
//       // if (oldValue) {
//       //   crystalOscillator.stopTask("task_data_source_data_" + oldValue.id)
//       // }
//       if (value) {
//         if (value.state == PatrolTaskState.NEW || value.state == PatrolTaskState.PROCESSING) {
//           crystalOscillator.startTask("task_data_source_data_" + value.id, async () => {
//             await dispatch("loadEvent", currentTask.eventId);
//             let tasks = (<PatrolEventDetailInfo>state.currentEventInfo).eventTasks
//             let newTask = tasks.find((task: PatrolTask) => {
//               return task.id == currentTask.id && task.eventId == currentTask.eventId
//             })
//             await dispatch("selectTask", newTask);
//           }, 1500, { leading: true, edging: true })
//         } else {
//           crystalOscillator.stopTask("task_data_source_data_" + value.id)
//         }
//       }
//     }
//   }
//   store.watch(<any>task, callback)
// }

function isSameDataSourceInstance(newValue: PatrolTask | null, oldValue: PatrolTask | null) {
  if (newValue == null && oldValue == null) {
    return true
  } else if (newValue == null || oldValue == null) {
    return false
  } else if (newValue.id == oldValue.id && newValue.state == oldValue.state) {
    if (newValue.type == "FlightAirTraceTask" || newValue.type == "FlightWaterSamplingTask") {
      if (oldValue.type == "GridChiefIdentificationTask") {
        return newValue.flightState == FlightAirTraceTaskState.Flying
      } else {
        return newValue.flightState == oldValue.flightState
      }
    } else {
      return true
    }
  }
}

// setTask(store)

export default store;