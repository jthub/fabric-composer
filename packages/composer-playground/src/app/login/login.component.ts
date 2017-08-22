import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IdentityService } from '../services/identity.service';
import { ClientService } from '../services/client.service';
import { InitializationService } from '../services/initialization.service';
import { AlertService } from '../basic-modals/alert.service';
import { DeleteComponent } from '../basic-modals/delete-confirm/delete-confirm.component';
import { IdentityCardService } from '../services/identity-card.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { DrawerService } from '../common/drawer';
import { ImportIdentityComponent } from './import-identity';

import { IdCard } from 'composer-common';

import { saveAs } from 'file-saver';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: [
        './login.component.scss'.toString()
    ]
})
export class LoginComponent implements OnInit {

    private usingLocally: boolean = false;
    private connectionProfileRefs: string[];
    private connectionProfileNames: Map<string, string>;
    private connectionProfiles: Map<string, string>;
    private idCardRefs: Map<string, string[]>;
    private idCards: Map<string, IdCard>;
    private showDeployNetwork: boolean = false;
    private editingConnectionProfile = null;
    private creatingIdCard: boolean = false;
    private showSubScreen: boolean = false;

    constructor(private identityService: IdentityService,
                private router: Router,
                private clientService: ClientService,
                private initializationService: InitializationService,
                private identityCardService: IdentityCardService,
                private modalService: NgbModal,
                private drawerService: DrawerService,
                private alertService: AlertService) {

    }

    ngOnInit(): Promise<void> {
        return this.initializationService.initialize()
            .then(() => {
                this.usingLocally = !this.initializationService.isWebOnly();

                return this.loadIdentityCards();
            });
    }

    loadIdentityCards(): Promise<void> {
        return this.identityCardService.getIdentityCards().then((cards) => {
            this.idCards = cards;
            this.connectionProfileNames = new Map<string, string>();
            this.connectionProfiles = new Map<string, string>();

            let newCardRefs = Array.from(cards.keys())
                .map((cardRef) => {
                    let connectionProfile = cards.get(cardRef).getConnectionProfile();
                    let connectionProfileRef: string = this.identityCardService.getQualifiedProfileName(connectionProfile);
                    if (!this.connectionProfileNames.has(connectionProfileRef)) {
                        this.connectionProfileNames.set(connectionProfileRef, connectionProfile.name);
                        this.connectionProfiles.set(connectionProfileRef, connectionProfile);
                    }

                    return [connectionProfileRef, cardRef];
                })
                .reduce((prev, cur) => {
                    let curCardRefs: string[] = prev.get(cur[0]) || [];
                    let cardRef: string = <string> cur[1];
                    return prev.set(cur[0], [...curCardRefs, cardRef]);
                }, new Map<string, string[]>());

            newCardRefs.forEach((cardRefs: string[], key: string) => {
                cardRefs.sort(this.sortIdCards.bind(this));
            });

            this.idCardRefs = newCardRefs;
            let unsortedConnectionProfiles = Array.from(this.connectionProfileNames.keys());
            let indexOfWeb = unsortedConnectionProfiles.indexOf('web-$default');
            let webProfile = unsortedConnectionProfiles[indexOfWeb];
            unsortedConnectionProfiles.splice(indexOfWeb, 1);
            unsortedConnectionProfiles.sort((a: string, b: string): number => {
                let aName = this.connectionProfileNames.get(a);
                let bName = this.connectionProfileNames.get(b);

                if (aName < bName) {
                    return -1;
                }
                if (aName > bName) {
                    return 1;
                }
            });
            unsortedConnectionProfiles.unshift(webProfile);
            this.connectionProfileRefs = unsortedConnectionProfiles;

        }).catch((error) => {
            this.alertService.errorStatus$.next(error);
        });
    }

    changeIdentity(cardRef: string): Promise<boolean | void> {
        let card = this.idCards.get(cardRef);
        let businessNetworkName = card.getBusinessNetworkName();

        return this.identityCardService.setCurrentIdentityCard(cardRef)
            .then(() => {
                return this.clientService.ensureConnected(businessNetworkName, true);
            })
            .then(() => {
                this.identityService.setLoggedIn(true);
                return this.router.navigate(['editor']);
            })
            .catch((error) => {
                this.alertService.errorStatus$.next(error);
            });
    }

    editConnectionProfile(connectionProfile): void {
        this.showSubScreen = true;
        this.editingConnectionProfile = connectionProfile;
    }

    closeSubView(): void {
        this.showSubScreen = false;
        this.showDeployNetwork = false;
        this.creatingIdCard = false;
        delete this.editingConnectionProfile;
    }

    createIdCard(): void {
        this.showSubScreen = true;
        this.creatingIdCard = true;
    }

    finishedCardCreation(event) {
        if (event) {
            this.closeSubView();
            return this.loadIdentityCards();
        } else {
            this.closeSubView();
        }
    }

    canDeploy(connectionProfileRef): boolean {
        let peerCardRef = this.identityCardService.getIdentityCardRefsWithProfileAndRole(connectionProfileRef, 'PeerAdmin')[0];

        if (!peerCardRef) {
            return false;
        }

        let channelCardRef = this.identityCardService.getIdentityCardRefsWithProfileAndRole(connectionProfileRef, 'ChannelAdmin')[0];

        if (!channelCardRef) {
            return false;
        }

        return true;
    }

    deployNetwork(connectionProfileRef): void {
        let peerCardRef = this.identityCardService.getIdentityCardRefsWithProfileAndRole(connectionProfileRef, 'PeerAdmin')[0];

        this.identityCardService.setCurrentIdentityCard(peerCardRef);

        this.showSubScreen = true;
        this.showDeployNetwork = true;
    }

    finishedDeploying(): Promise<void> {
        this.showSubScreen = false;
        this.showDeployNetwork = false;

        return this.loadIdentityCards();
    }

    importIdentity() {
        this.drawerService.open(ImportIdentityComponent).result.then((result) => {
            return this.identityCardService.addIdentityCard(result);
        }).then((cardRef) => {
            this.alertService.successStatus$.next({
                title: 'ID Card imported',
                text: 'The ID card ' + this.identityCardService.getIdentityCard(cardRef).getName() + ' was successfully imported',
                icon: '#icon-role_24'
            });
        }).then(() => {
            return this.loadIdentityCards();
        }).catch((reason) => {
            this.alertService.errorStatus$.next(reason);
        });
    }

    exportIdentity(cardRef): Promise<any> {
        let fileName;

        return this.identityCardService.getIdentityCardForExport(cardRef)
            .then((card) => {
                fileName = card.getName() + '.card';
                return card.toArchive();
            })
            .then((archiveData) => {
                let file = new Blob([archiveData],
                    {type: 'application/octet-stream'});
                saveAs(file, fileName);
            })
            .catch((reason) => {
                this.alertService.errorStatus$.next(reason);
            });
    }

    removeIdentity(cardRef): void {
        let userId: string = this.idCards.get(cardRef).getName();
        const confirmModalRef = this.modalService.open(DeleteComponent);
        confirmModalRef.componentInstance.headerMessage = 'Remove ID Card';
        confirmModalRef.componentInstance.fileName = userId;
        confirmModalRef.componentInstance.fileType = 'ID Card';
        confirmModalRef.componentInstance.deleteMessage = 'Are you sure you want to do this?';
        confirmModalRef.componentInstance.deleteFrom = 'My Wallet';
        confirmModalRef.componentInstance.confirmButtonText = 'Remove';

        confirmModalRef.result
            .then((result) => {
                if (result) {
                    this.alertService.busyStatus$.next({
                        title: 'Removing ID card',
                        text: 'removing the ID card ' + userId
                    });

                    this.identityCardService.deleteIdentityCard(cardRef)
                        .then(() => {
                            this.alertService.busyStatus$.next(null);
                            this.alertService.successStatus$.next({
                                title: 'ID Card Removed',
                                text: 'The ID card was successfully removed from My Wallet.',
                                icon: '#icon-trash_32'
                            });

                            return this.loadIdentityCards();
                        })
                        .catch((error) => {
                            this.alertService.busyStatus$.next(null);
                            this.alertService.errorStatus$.next(error);
                        });
                }
            }, (reason) => {
                if (reason && reason !== 1) {
                    this.alertService.busyStatus$.next(null);
                    this.alertService.errorStatus$.next(reason);
                }
            });
    }

    private sortIdCards(a, b): number {
        let cardA = this.identityCardService.getIdentityCard(a);
        let cardB = this.identityCardService.getIdentityCard(b);

        let aBusinessNetwork = cardA.getBusinessNetworkName();
        let bBusinessNetwork = cardB.getBusinessNetworkName();
        let aName = cardA.getName();
        let bName = cardB.getName();
        let aRoles = cardA.getRoles();
        let bRoles = cardB.getRoles();

        // sort by business network name
        let result = this.sortBy(aBusinessNetwork, bBusinessNetwork);

        if (result !== 0) {
            return result;
        }

        // then by role
        result = this.sortBy(aRoles, bRoles);
        if (result !== 0) {
            return result;
        }

        // then by name
        result = this.sortBy(aName, bName);
    }

    private sortBy(aName, bName): number {
        if (!aName && !bName) {
            return 0;
        }

        if (!aName && bName) {
            return -1;
        }

        if (aName && !bName) {
            return 1;
        }

        if (aName < bName) {
            return -1;
        }

        if (aName > bName) {
            return 1;
        }

        // they are equal
        return 0;
    }
}
