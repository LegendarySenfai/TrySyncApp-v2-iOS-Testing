Instructions para ma-run niyo locally system. 
a
DATABASE INSTRUCTIONS:
1. Unang una pull niyo muna tong repo main
2. pag ka pull niyo, makikita niyo may bagong sql file sa database_backups, which is updated_db.sql
3. kunin niyo lang file path nung file na yun kasi gagamitin niyo pag import sa local niyo.
4. now tingnan niyo naman yung Backend>.env file
5. Makikita niyo jan naka comment out yung deployed db na credentials, yung naka ok lang is yung local. Wag niyo gagalawin yung naka comment para madali lang madali deployment
6. Mas maganda if pare-parehas na tayo ng credentials for db para wala na babaguhin kada pull at push
7. tingnan niyo credentials na nasa .env file, if iba yung sakin sa inyo, gawa na lang kayo ng bagong connection or localhost server following the same credentials na nakalagay sa file. Puwede kayo patulong sa gemini jan madali lang yan
8. Then pag meron na at same credentials, open niyo yung connectiion na yun (Local instance MySQL80, localhost:3306) then pag nag tanong password, lagay niyo lang Senfai_123!
9. Pag ka open niyo, double click niyo trisyncdb if meron na, if wala, gawa kayo (gemini niyo lang din to steps by step).
10. pag ka double click, tingin kayo upper left, hanapin niyo server, then click Data Import.
11. Mag bubukas bagong screen yan sa workbench. Pindutin niyo Import from Self-Contained File. Then pindutin niyo yung tutuldok sa dulo ng file path (...) then hanapin niyo yung updated_db.sql na galing sa github
12. sa default target schema, piliin niyo trisyncdb then Start Import na.
13. Now if pag may error, copy niyo error then paste niyo kay gemini. Bigyan niyo muna context kung ano ginagawa niyo.


api.js (ReactNative)
1. Now ito naman para lang sa config sa react native kasi di siya tulad ng web na auto scan kung localhost o hindi. Punta kayo sa ReactNative>src>config>api.js
2. Yung nakalagay jan is wag niyo aalisin, icomment niyo lang, then copy paste kung ano nasa yung kinomment niyo.
3. Open niyo muna cmd then ipconfig kayo, hanapin niyo kung ano ipv4 niyo then copy that
4. paste that sa line of code na nasa api.js for ip address configuration line 7.
5. wag niyo aalisin yung part na ":5000" sa dulo ng ip address kasi need yun for db connectoion
6. then yun lang. pag mag pupush kayo sa github. ganon lang ng ganon. Balik niyo lang sa dati yung api.js para iwas error.
