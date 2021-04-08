import React, { useEffect, useState } from 'react'
import {
    ExternalChangesetFields,
    GitBranchChangesetDescriptionFields,
    ChangesetState,
} from '../../../../graphql-operations'
import { LinkOrSpan } from '@sourcegraph/shared/src/components/LinkOrSpan'
import ExternalLinkIcon from 'mdi-react/ExternalLinkIcon'
import { ChangesetLabel } from './ChangesetLabel'
import { Link } from '@sourcegraph/shared/src/components/Link'
import { ChangesetLastSynced } from './ChangesetLastSynced'
import classNames from 'classnames'
import { LoadingSpinner } from '@sourcegraph/react-loading-spinner'
import CheckIcon from 'mdi-react/CheckIcon'

export interface ExternalChangesetInfoCellProps {
    node: ExternalChangesetFields
    viewerCanAdminister: boolean
    className?: string
}

export const ExternalChangesetInfoCell: React.FunctionComponent<ExternalChangesetInfoCellProps> = ({
    node,
    viewerCanAdminister,
    className,
}) => {
    const [hadRunningJobWhenFirstRendered, setHadRunningJobWhenFirstRendered] = useState<boolean>(!!node.hasRunningJob)
    useEffect(() => {
        if (!hadRunningJobWhenFirstRendered && node.hasRunningJob) {
            setHadRunningJobWhenFirstRendered(true)
            const timer = setTimeout(() => {
                setHadRunningJobWhenFirstRendered(false)
            }, 5000)
            return () => clearTimeout(timer)
        }
    }, [node.hasRunningJob, hadRunningJobWhenFirstRendered])
    return (
        <div className={classNames('d-flex flex-column', className)}>
            <div className="m-0 d-flex">
                <h3
                    className={classNames(
                        'm-0 text-nowrap',
                        !(!node.hasRunningJob && hadRunningJobWhenFirstRendered) && 'flex-grow-1'
                    )}
                >
                    <LinkOrSpan
                        to={node.externalURL?.url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-2"
                    >
                        {(isImporting(node) || importingFailed(node)) && (
                            <>
                                Importing changeset
                                {node.externalID && <> #{node.externalID} </>}
                            </>
                        )}
                        {!isImporting(node) && !importingFailed(node) && (
                            <>
                                {node.title}
                                {node.externalID && <> (#{node.externalID}) </>}
                            </>
                        )}
                        {node.externalURL?.url && (
                            <>
                                {' '}
                                <ExternalLinkIcon size="1rem" />
                            </>
                        )}
                    </LinkOrSpan>
                </h3>
                {node.hasRunningJob && (
                    <>
                        <span>
                            <LoadingSpinner className="flex-grow-1 icon-inline" />
                        </span>
                        <marquee>
                            <i>
                                <strong>🏇 Commenting on changeset</strong>
                            </i>
                        </marquee>
                    </>
                )}
                {!node.hasRunningJob && hadRunningJobWhenFirstRendered && (
                    <span className="flex-grow-1">
                        <CheckIcon className="text-success icon-inline" /> 🐴
                    </span>
                )}
                {node.labels.length > 0 && (
                    <span className="d-block d-md-inline-block">
                        {node.labels.map(label => (
                            <ChangesetLabel label={label} key={label.text} />
                        ))}
                    </span>
                )}
            </div>
            <div>
                <span className="mr-2 d-block d-mdinline-block">
                    <Link to={node.repository.url} target="_blank" rel="noopener noreferrer">
                        {node.repository.name}
                    </Link>{' '}
                    {hasHeadReference(node) && (
                        <div className="d-block d-sm-inline-block">
                            <span className="badge badge-secondary text-monospace">{headReference(node)}</span>
                        </div>
                    )}
                </span>
                {![
                    ChangesetState.FAILED,
                    ChangesetState.PROCESSING,
                    ChangesetState.RETRYING,
                    ChangesetState.UNPUBLISHED,
                ].includes(node.state) && (
                    <ChangesetLastSynced changeset={node} viewerCanAdminister={viewerCanAdminister} />
                )}
            </div>
        </div>
    )
}

function isImporting(node: ExternalChangesetFields): boolean {
    return node.state === ChangesetState.PROCESSING && !hasHeadReference(node)
}

function importingFailed(node: ExternalChangesetFields): boolean {
    return node.state === ChangesetState.FAILED && !hasHeadReference(node)
}

function headReference(node: ExternalChangesetFields): string | undefined {
    if (hasHeadReference(node)) {
        return node.currentSpec?.description.headRef
    }
    return undefined
}

function hasHeadReference(
    node: ExternalChangesetFields
): node is ExternalChangesetFields & {
    currentSpec: ExternalChangesetFields & { description: GitBranchChangesetDescriptionFields }
} {
    return node.currentSpec?.description.__typename === 'GitBranchChangesetDescription'
}
