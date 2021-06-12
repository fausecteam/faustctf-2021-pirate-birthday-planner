#!/usr/bin/env python3

from ctf_gameserver import checkerlib
import requests
from requests import Session
import logging
import utils
import binascii
import base64

PORT = 2727

class MyChecker(checkerlib.BaseChecker):

    def __init__(self, ip, team):
        checkerlib.BaseChecker.__init__(self, ip, team)
        self._baseurl = f'http://[{self.ip}]:{PORT}'
        logging.info(f"URL: {self._baseurl}")

    # Basics - Most error handling is done in private funcs
    def place_flag(self, tick):
        res = self._check_index()
        if not res:
            return checkerlib.CheckResult.DOWN
        flag = checkerlib.get_flag(tick)
        creds = self._create_party(flag)
        if not creds:
            return checkerlib.CheckResult.FAULTY
        logging.info(creds)
        checkerlib.store_state("flag_" + str(tick), creds)
        checkerlib.set_flagid(creds["party_id"])
        return checkerlib.CheckResult.OK

    def check_service(self):
        # check /
        res = self._check_index()
        if not res:
            return checkerlib.CheckResult.DOWN
        
        contents = ["party[title]", "party[admin]", "party[guestlist]", "party[description]", "party[time]", "party[loc]"]
        for c in contents:
            if c not in res.text:
                logging.error(f"{c} was not found in HTML")
                return checkerlib.CheckResult.FAULTY
        
        # check create party
        desc = utils.random_lorem_ipsum()
        creds = self._create_party(desc)
        if not creds:
            return checkerlib.CheckResult.FAULTY

        party_id = creds["party_id"]

        # check login and get details as admin
        # /party/:partyId/details
        # /party/:partyId/new
        admin_session = Session()
        party = self._join_party(admin_session, party_id, creds["user"], creds["pin"])
        if not party:
            return checkerlib.CheckResult.FAULTY
        
        guest_creds = {}
        for g in party["guestlist"]:
            if g["name"] != creds["user"]:
                guest_creds = g

        # check change pw
        # /party/:partyId/updatepw
        new_pin = utils.random_pin()
        res = self._update_password(admin_session, party_id, new_pin)
        if not res:
            return checkerlib.CheckResult.FAULTY

        details = self._get_details(admin_session, party_id)
        if not details:
            return checkerlib.CheckResult.FAULTY

        pin = details["guestlist"][-1]["pin"]
        if pin != new_pin:
            logging.error(details)
            logging.error(f'Updated pin from {creds["pin"]} to {new_pin}, but it is {pin}')
            return checkerlib.CheckResult.FAULTY
            
        # check login and get details as guest
        # /party/:partyId/details
        # /party/:partyId/new
        guest_session = Session()
        party = self._join_party(guest_session, party_id, guest_creds["name"], guest_creds["pin"])
        if not party:
            return checkerlib.CheckResult.FAULTY

        # check add to party
        # /party/:partyId/add
        res = self._add_party(guest_session, party_id)
        if not res:
            return checkerlib.CheckResult.FAULTY

        # check remove from party
        # /party/:partyId/remove
        res = self._remove_party(guest_session, party_id)
        if not res:
            return checkerlib.CheckResult.FAULTY

        # TODO /party/:partyId/state

        return checkerlib.CheckResult.OK

    def check_flag(self, tick):
        if not self._check_index():
            return checkerlib.CheckResult.DOWN
        flag = checkerlib.get_flag(tick)
        creds = checkerlib.load_state("flag_" + str(tick))
        if not creds:
            logging.error(f"Cannot find creds for tick {tick}")
            return checkerlib.CheckResult.FLAG_NOT_FOUND
        party = self._join_party(Session(), creds["party_id"], creds["user"], creds["pin"])
        if not party:
            return checkerlib.CheckResult.FLAG_NOT_FOUND  # If DB reset, the party does not exist
        
        try:
            desc = base64.b64decode(party["description"].encode())
        except: 
            return checkerlib.CheckResult.FLAG_NOT_FOUND

        test_flag = "".join([chr(c ^ ord(party["admin"][0])) for c in desc])
        if flag != test_flag:
            return checkerlib.CheckResult.FLAG_NOT_FOUND
        return checkerlib.CheckResult.OK

    # Private Funcs - Return None if error
    def _check_index(self):
        res = requests.get(f"{self._baseurl}/")
        if res.status_code != 200:
            return utils.log_error_and_quit(res, f"Status Code is not 200: {res.text}")
        return res

    def _create_party(self, description):
        logging.info("Create party")
        session = Session()
        url = f"{self._baseurl}/party"
        admin = utils.random_name()
        loc = utils.random_loc()
        guest = None 
        while not guest or guest == admin:
            guest = utils.random_name()
        data = {
                "party[title]": "Big Party at " + loc,
                "party[admin]": admin,
                "party[guestlist]": guest,
                "party[description]": description,
                "party[time]": utils.random_date(),
                "party[loc]": loc
                }

        res = session.post(url, data=data)
        if res.status_code != 200:
            return utils.log_error_and_quit(res, "Status Code is not 200")

        party_id = res.url.split('/')[-1]
        if not utils.check_uuid(party_id):
            return utils.log_error_and_quit(res, "Broken UUID {party_id}")

        details = self._get_details(session, party_id)
        if not details:
            return None

        pin = details["guestlist"][-1]["pin"]
        return {'party_id': party_id, 'user': admin, 'pin': pin}

    def _join_party(self, session, party_id, name, pin):
        logging.info("Join party")
        url = f"{self._baseurl}/party/{party_id}"
        data = {"user": name, "pin": pin}
        res = session.post(url + "/new", data=data)
        if not "ok" in res.text:
            logging.error("Cannot join party")
            logging.error(res.text)
            return None
        
        return self._get_details(session, party_id)

    def _add_party(self, session, party_id):
        logging.info("Add user to party")
        url = f"{self._baseurl}/party/{party_id}"        
        res = session.post(url + "/add")
        if res.status_code != 200:
            return utils.log_error_and_quit(res, f"Status Code is not 200: {res.text}")

        if not "ok" in res.text:
            logging.error("Cannot add user to party")
            logging.error(res.text)
            return None

        return res.json()

    def _remove_party(self, session, party_id):
        logging.info("Remove user from party")
        url = f"{self._baseurl}/party/{party_id}"        
        res = session.post(url + "/remove")
        if res.status_code != 200:
            return utils.log_error_and_quit(res, f"Status Code is not 200: {res.text}")

        if not "ok" in res.text:
            logging.error("Cannot remove user from party")
            logging.error(res.text)
            return None
        return res.json()

    def _update_password(self, session, party_id, new_pin):
        url = f"{self._baseurl}/party/{party_id}"
        data = {"pin": new_pin}
        res = session.post(url + "/updatepw", data=data)

        # sometimes, update fails. mby a second try helps
        if res.status_code == 401 and "work" in res.text:
            utils.log("Got 401 for pw update, I'll try again")
            res = session.post(url + "/updatepw", data=data)

        if res.status_code != 200:
            return utils.log_error_and_quit(res, f"Status Code is not 200: {res.text}")
        return res

    def _get_details(self, session, uuid):
        res = session.get(f"{self._baseurl}/party/{uuid}/details")
        if res.status_code != 200:
            return utils.log_error_and_quit(res, f"Status Code is not 200: {res.text}")
        
        try:
            res_json = res.json()
        except: 
            return utils.log_error_and_quit(res, f"Res is no JSON: {res.text}")

        keys = ["joined", "title", "admin", "guestlist", "description", "time", "loc", "uuid"]
        for k in keys:
            if k not in res_json:
                return utils.log_error_and_quit(res, f"{k} is not in json: {res_json}")
        for user in res_json["guestlist"]:
            if "name" not in user or "pin" not in user:
                return utils.log_error_and_quit(res, f"User is wrong {user}")
        return res_json

if __name__ == '__main__':
    checkerlib.run_check(MyChecker)
