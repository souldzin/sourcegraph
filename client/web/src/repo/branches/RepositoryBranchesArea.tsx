import MapSearchIcon from 'mdi-react/MapSearchIcon'
import React, { useMemo } from 'react'
import { Route, RouteComponentProps, Switch } from 'react-router'

import { BreadcrumbSetters } from '../../components/Breadcrumbs'
import { HeroPage } from '../../components/HeroPage'
import { RepositoryFields } from '../../graphql-operations'
import { RepoHeaderBreadcrumbNavItem } from '../RepoHeaderBreadcrumbNavItem'

import { RepositoryBranchesAllPage } from './RepositoryBranchesAllPage'
import { RepositoryBranchesNavbar } from './RepositoryBranchesNavbar'
import { RepositoryBranchesOverviewPage } from './RepositoryBranchesOverviewPage'

const NotFoundPage: React.FunctionComponent = () => (
    <HeroPage
        icon={MapSearchIcon}
        title="404: Not Found"
        subtitle="Sorry, the requested repository branches page was not found."
    />
)

interface Props extends RouteComponentProps<{}>, BreadcrumbSetters {
    repo: RepositoryFields
}

/**
 * Properties passed to all page components in the repository branches area.
 */
export interface RepositoryBranchesAreaPageProps {
    /**
     * The active repository.
     */
    repo: RepositoryFields
}

/**
 * Renders pages related to repository branches.
 */
export const RepositoryBranchesArea: React.FunctionComponent<Props> = ({ useBreadcrumb, repo, match }) => {
    const transferProps: { repo: RepositoryFields } = {
        repo,
    }

    useBreadcrumb(
        useMemo(
            () => ({
                key: 'branches',
                element: <RepoHeaderBreadcrumbNavItem key="branches">Branches</RepoHeaderBreadcrumbNavItem>,
            }),
            []
        )
    )

    return (
        <div className="repository-branches-area container">
            <RepositoryBranchesNavbar className="my-3" repo={repo.name} />
            <Switch>
                {/* eslint-disable react/jsx-no-bind */}
                <Route
                    path={`${match.url}`}
                    key="hardcoded-key" // see https://github.com/ReactTraining/react-router/issues/4578#issuecomment-334489490
                    exact={true}
                    render={routeComponentProps => (
                        <RepositoryBranchesOverviewPage {...routeComponentProps} {...transferProps} />
                    )}
                />
                <Route
                    path={`${match.url}/all`}
                    key="hardcoded-key" // see https://github.com/ReactTraining/react-router/issues/4578#issuecomment-334489490
                    exact={true}
                    render={routeComponentProps => (
                        <RepositoryBranchesAllPage {...routeComponentProps} {...transferProps} />
                    )}
                />
                <Route key="hardcoded-key" component={NotFoundPage} />
                {/* eslint-enable react/jsx-no-bind */}
            </Switch>
        </div>
    )
}
