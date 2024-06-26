import * as React from 'react'
import classnames from 'classnames/bind'
import { CodeBlockViewer } from '../code_block'
import { C2EventViewer } from '../c2-event'
import { HarViewer, isAHar } from '../http_cycle_viewer'
import { SupportedEvidenceType, CodeBlock, EvidenceViewHint, InteractionHint, UrlData, C2Event } from 'src/global_types'
import { getEvidenceAsC2Event, getEvidenceAsCodeblock, getEvidenceAsString, getEvidenceAsUrlData, updateEvidence } from 'src/services/evidence'
import { useWiredData } from 'src/helpers'
import ErrorDisplay from 'src/components/error_display'
import LazyLoadComponent from 'src/components/lazy_load_component'


import TerminalPlayer from 'src/components/terminal_player'
import { useEvidenceContext } from 'src/contexts/evidences_context'
import { isAfter } from 'date-fns'

const cx = classnames.bind(require('./stylesheet'))

function getComponent(evidenceType: SupportedEvidenceType) {
  switch (evidenceType) {
    case 'codeblock':
      return EvidenceCodeblock
    case 'image':
      return EvidenceImage
    case 'terminal-recording':
      return EvidenceTerminalRecording
    case 'http-request-cycle':
      return EvidenceHttpCycle
    case 'c2-event':
      return EvidenceC2Event
    case 'event':
      return EvidenceEvent
    case 'none':
    default:
      return null
  }
}

export default (props: {
  operationSlug: string,
  evidenceUuid: string,
  contentType: SupportedEvidenceType,
  viewHint?: EvidenceViewHint,
  interactionHint?: InteractionHint,
  className?: string,
  fitToContainer?: boolean,
  useS3Url: boolean,
  onClick?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
}) => {
  const Component = getComponent(props.contentType)
  if (Component == null) return null

  const className = cx(
    'root',
    props.className,
    props.contentType,
    props.fitToContainer ? 'fit' : 'full',
    { clickable: props.onClick },
  )

  return (
    <div className={className} onClick={props.onClick}>
      <LazyLoadComponent><Component {...props} /></LazyLoadComponent>
    </div>
  )
}

type EvidenceProps = {
  operationSlug: string,
  evidenceUuid: string,
  viewHint?: EvidenceViewHint,
  interactionHint?: InteractionHint,
  useS3Url: boolean
}

const EvidenceCodeblock = (props: EvidenceProps) => {
  const wiredEvidence = useWiredData<CodeBlock>(React.useCallback(() => getEvidenceAsCodeblock({
    operationSlug: props.operationSlug,
    evidenceUuid: props.evidenceUuid,
  }), [props.operationSlug, props.evidenceUuid]))

  return wiredEvidence.render(evi => <CodeBlockViewer value={evi} />)
}

const shouldUseCachedUrl = (imgData: UrlData | undefined, props: EvidenceProps) => (
  imgData && props.useS3Url && isAfter(new Date(imgData.expirationTime), new Date())
)

const EvidenceC2Event = (props: EvidenceProps) => {
  const wiredEvidence = useWiredData<C2Event>(React.useCallback(() => getEvidenceAsC2Event({
    operationSlug: props.operationSlug,
    evidenceUuid: props.evidenceUuid,
  }), [props.operationSlug, props.evidenceUuid]))

  return wiredEvidence.render(evi => <C2EventViewer value={evi} />)  //
}

const EvidenceImage = (props: EvidenceProps) => {
  const { imgDataSetter, cachedUrls } = useEvidenceContext()
  let url = `/web/operations/${props.operationSlug}/evidence/${props.evidenceUuid}/media`

  const imgData = cachedUrls.get(props.evidenceUuid)

  if (shouldUseCachedUrl(imgData, props)) {
    url = imgData?.url as string
  } else if (props.useS3Url) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const wiredUrl = useWiredData<UrlData>(React.useCallback(() => getEvidenceAsUrlData({
      operationSlug: props.operationSlug,
      evidenceUuid: props.evidenceUuid,
    }), [props.operationSlug, props.evidenceUuid]))

    wiredUrl.expose(s3url => {
      imgDataSetter(props.evidenceUuid, s3url)
      url = s3url.url
    })
  }

  return <img src={url} />
}

const EvidenceEvent = (_props: EvidenceProps) => {
  return <div className={cx('event')}></div>
}

const EvidenceTerminalRecording = (props: EvidenceProps) => {
  const wiredEvidence = useWiredData<string>(React.useCallback(() => getEvidenceAsString({
    operationSlug: props.operationSlug,
    evidenceUuid: props.evidenceUuid,
  }), [props.operationSlug, props.evidenceUuid]))

  const updateContent = (content: Blob): Promise<void> => updateEvidence({
    operationSlug: props.operationSlug,
    evidenceUuid: props.evidenceUuid,
    updatedContent: content,
  })

  return wiredEvidence.render(evi => <TerminalPlayer content={evi} playerUUID={props.evidenceUuid} onTerminalScriptUpdated={updateContent} />)
}

const EvidenceHttpCycle = (props: EvidenceProps) => {
  const wiredEvidence = useWiredData<string>(React.useCallback(() => getEvidenceAsString({
    operationSlug: props.operationSlug,
    evidenceUuid: props.evidenceUuid,
  }), [props.operationSlug, props.evidenceUuid]))

  return wiredEvidence.render(evi => {
    try {
      const log = JSON.parse(evi)
      if (isAHar(log)) {
        const isActive = props.interactionHint == 'inactive' ? {disableKeyHandler : true} : {}
        return <HarViewer log={log} viewHint={props.viewHint} {...isActive} />
      }
      return <ErrorDisplay title="Corrupted HAR file" err={new Error("unsupported format")} />
    }
    catch (err) {
      return <ErrorDisplay title="Corrupted HAR file" err={err}/>
    }
  })
}
