//
const express = require("express");
const socket = require("socket.io");
var firebase = require("firebase");
const createError = require("http-errors");
const webrtc = require("wrtc");
const nodemailer = require("nodemailer");
const app = express();
app.use(express.json());
const http = require("http");
require("dotenv").config();
const server = http.createServer(app);

const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");

  res.header(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers,X-Access-Token,XKey,Authorization"
  );

  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    return res.status(200).json({});
  }
  next();
});
//cors end

//firebase end
const schedule = {};
const room = {};
const idToRoom = {};
const roomToId = {};
const mutedMentor = {};
const videoMute = {};
//student
const studentConnectedTo = {};
const studentIdToUuid = {};
const UuidToStudentId = {};
const recordRaw = {};
// const mentorStaticId = {};

//start
io.on("connection", (socket) => {
  socket.on("mentor start class", async (payload) => {
    const { mentorId, scheduleID } = payload;
    // console.log(room[mentorId]);
    if (room?.[mentorId]?.length > 0 && schedule[mentorId] === scheduleID) {
      await room[mentorId].forEach((userUUid) => {
        const makeSoId = UuidToStudentId[userUUid];
        socket.emit("student want to connect", {
          studentId: makeSoId,
        });
      });
    } else {
      room[mentorId] = [];

      schedule[mentorId] = scheduleID;
      idToRoom[socket.id] = mentorId;
      roomToId[mentorId] = socket.id;
      mutedMentor[mentorId] = true;
      videoMute[mentorId] = true;
    }
  });
  // medil start
  socket.on("mentor refresh try", (payload) => {
    const { mentorUui } = payload;
    delete roomToId[mentorUui];
    roomToId[mentorUui] = socket.id;
    if (roomToId[mentorUui]) {
      // console.log("mentor id");
      delete idToRoom[roomToId[mentorUui]];
      idToRoom[socket.id] = mentorUui;

      socket.emit("already have", "data");
    }
  });

  socket.on("after refresh", (payload) => {
    const { roomRef } = payload;

    if (room[roomRef]) {
      room[roomRef].forEach((key) => {
        socket.emit("student want to connect", {
          studentId: UuidToStudentId[key],
        });
      });
    }
  });
  // join section2
  socket.on("student want to connect", async (payload) => {
    const { mentorUuid, studentUuid, scheduleID } = payload;

    if (UuidToStudentId[studentUuid]) {
      delete studentIdToUuid[UuidToStudentId[studentUuid]];
      studentIdToUuid[socket.id] = studentUuid;
      delete UuidToStudentId[studentUuid];
      UuidToStudentId[studentUuid] = socket.id;
      //change
      if (schedule[mentorUuid] == scheduleID) {
        const mentorSocketId = await roomToId?.[mentorUuid];
        io.to(mentorSocketId).emit("student want to connect", {
          studentId: socket.id,
        });
      } else {
        socket.emit("open dialog", "Class has ended....");
      }
    } else {
      if (roomToId[mentorUuid] && schedule[mentorUuid] == scheduleID) {
        UuidToStudentId[studentUuid] = socket.id;
        studentIdToUuid[socket.id] = studentUuid;

        room[mentorUuid].push(studentUuid);
        const mentiId = await roomToId?.[mentorUuid];
        io.to(mentiId).emit("student want to connect", {
          studentId: socket.id,
          studentUuid,
        });
      } else {
        if (roomToId[mentorUuid]) {
          //   socket.emit("open dialog", "Your mentor does not start class..");
          // } else {
          socket.emit("open dialog", "Your mentor busy with other class...");
        } else {
          // console.log(studentIdToUuid[socket.id]);
          socket.emit("open dialog", "Class has not started yet.");
        }
      }
    }
  });
  //signal send
  socket.on("sending signal", (payload) => {
    const { userToSignal, signal, uid } = payload;
    studentConnectedTo[studentIdToUuid[userToSignal]] = uid;
    io.to(userToSignal).emit("mentor send to student", {
      mentorFrontId: socket.id,
      mentorSignal: signal,
      muteStatus: mutedMentor[idToRoom[socket.id]],
      videoStatus: videoMute[idToRoom[socket.id]],
    });
  });
  socket.on("returning signal", (payload) => {
    const { signal, mentorFrontId } = payload;

    io.to(mentorFrontId).emit("student signal to mentor", {
      studentSignal: signal,
      id: socket.id,
    });
  });

  socket.on("video mute status", (payload) => {
    const { cameraStatus, mentorUuid } = payload;
    videoMute[mentorUuid] = cameraStatus;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("video signal", {
          cameraStatus,
        });
      });
    }
  });

  socket.on("mentor mute status", (payload) => {
    const { mute, mentorUuid } = payload;
    mutedMentor[mentorUuid] = mute;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("mute signal", {
          mute,
        });
      });
    }
  });

  //mute end
  socket.on("end meeting", (payload) => {
    const { mentorUUid } = payload;
    // room[mentorId] = [];
    delete idToRoom[socket.id];
    delete roomToId[mentorUUid];
    delete mutedMentor[mentorUUid];
    delete videoMute[mentorUUid];
    delete schedule[mentorUUid]; // for it host leave card not display

    if (room[mentorUUid]) {
      room[mentorUUid].forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "connected host leave",
          "data"
        );
        // delete studentIdToUuid[UuidToStudentId[studentUuid]];
        // delete UuidToStudentId[studentUuid];
      });
      delete room[mentorUUid];
    }
    // socket.emit("mentor want to upload video", recordRaw[mentorUUid]);
  });
  socket.on("Student exit himself", (payload) => {
    const { studentUid } = payload;
    if (UuidToStudentId[studentUid]) {
      delete studentIdToUuid[UuidToStudentId[studentUid]];
      delete UuidToStudentId[studentUid];
    }
  });
  socket.on("host take leave it clint side action", (payload) => {
    const { studentUuid } = payload;
    delete studentIdToUuid[socket.id];
    delete UuidToStudentId[studentUuid];
  });
  socket.on("student leave the meeting", (payload) => {
    const { studentId, mentorUuid, tempMessage } = payload;
    if (room[mentorUuid]) {
      const afterLeave = room[mentorUuid].filter((user) => user !== studentId);
      room[mentorUuid] = afterLeave;
      const mentorSocketId = roomToId[mentorUuid];
      io.to(mentorSocketId).emit("one student leave", {
        studentIdUuid: studentId,
        tempMessage,
      });
      delete studentIdToUuid[socket.id];
      delete UuidToStudentId[studentId];
    }
  });
  //message
  socket.on("send message to student", (payload) => {
    const { tempMessage } = payload; //uuid, message
    if (room[tempMessage.uuid].length >= 1) {
      room[tempMessage.uuid].forEach((studentUuid) => {
        if (UuidToStudentId[studentUuid]) {
          io.to(UuidToStudentId[studentUuid]).emit("message receive", {
            tempMessage,
          });
        }
      });
    }
  });
  socket.on("send message to all", (payload) => {
    const { tempMessage, mentorUuid } = payload;

    if (room[mentorUuid]) {
      io.to(roomToId[mentorUuid]).emit("one of the student send message", {
        tempMessage,
      });
    }
  });
  socket.on("send to other", (payload) => {
    const { tempMessage, mentorUuid } = payload;
    if (room[mentorUuid].length > 1) {
      const exceptSender = room[mentorUuid].filter(
        (studentUuid) => studentUuid !== tempMessage.uuid
      );
      exceptSender.forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "all student get other student data",
          { tempMessage }
        );
      });
    }
  });
  //message end
  //record video start

  socket.on("record start", (payload) => {
    socket.emit("record", "data");
  });
  socket.on("stop record", (payload) => {
    socket.emit("record stop", "data");
  });
  //recording raw data
  socket.on("recording raw data", (payload) => {
    const { record, mentor } = payload;
    if (recordRaw[mentor]) {
      recordRaw[mentor] = [...recordRaw[mentor], record];
    } else {
      recordRaw[mentor] = [record];
    }
    // console.log(mentor);
  });
  socket.on("save in cloud", (payload) => {
    const { mentorUid } = payload;
    //storage
    // console.log(recordRaw[mentorUid]);
  });
  //end Video

  //disconnect part
  socket.on("disconnect", () => {
    if (room[idToRoom[socket.id]]) {
      const mentorUid = idToRoom?.[socket.id];
      const roomTempData = room[mentorUid];
      //clear data from var
      // delete idToRoom[socket.id];
      // if i comment out then refresh will work
      // delete room[mentorUid];
      // delete roomToId[mentorUid];
      // delete mutedMentor[mentorUid];
      // delete videoMute[mentorUid];
      //may be it create issues
      roomTempData.forEach((user) => {
        const studentSocketId = UuidToStudentId?.[user];
        io.to(studentSocketId).emit("connected host leave", "data");
      });
      socket.broadcast.emit("send class already exit", {
        roomToId,
      });
    } else if (studentIdToUuid[socket.id]) {
      const studentIdUuid = studentIdToUuid[socket.id];
      const mentorUuid = studentConnectedTo[studentIdUuid];

      if (room[mentorUuid]) {
        const haveIn = room[mentorUuid].filter((id) => id !== studentIdUuid);
        room[mentorUuid] = haveIn;
      }
      delete UuidToStudentId[studentIdUuid];
      delete studentIdToUuid[socket.id];
      delete studentConnectedTo[studentIdUuid];
      io.to(roomToId[mentorUuid]).emit("one student leave", { studentIdUuid });
    }
  });
});

//live stream 2

//update one stream var
let peerStage;
let stream;
io.of("/stream").on("connection", (socket) => {
  socket.on("offer", async (payload) => {
    const { offer } = payload;
    peerStage = createPeer(socket);
    const desc = new webrtc.RTCSessionDescription(offer);
    peerStage
      .setRemoteDescription(desc)

      .then((sd) => {
        peerStage.createAnswer().then((answer) => {
          peerStage.setLocalDescription(answer).then((stl) => {
            socket.emit("answer", { answer: peerStage.localDescription });
          });
        });
      });
  });
  // socket.emit("ice_stream",payload=>{
  //   const {ice} = payload
  //   console.log(ice);
  //   peerStage.addIceCandidate(ice)
  // })
});
// socket function
const createPeer = (socket) => {
  const peer = new webrtc.RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.stunprotocol.org",
      },
    ],
  });
  peer.ontrack = (e) => handleTrackEvent(e, peer);
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice", { ice: event.candidate });
    }
  };
  socket.on("ice_stream", async (payload) => {
    const { ice } = payload;
    // console.log(ice);
    if (ice) {
      await peer.addIceCandidate(ice);
    }
  });
  // events
  peer.onconnectionstatechange = (event) => {
    // console.log("onconnectionstatechange", event);
    // console.log(
    //   "pc.current.connectionState",
    //   pc.current?.connectionState
    // );
    socket.emit("event", {
      "pc.current.connectionState": peer?.connectionState,
      onconnectionstatechange: event,
    });
  };
  peer.oniceconnectionstatechange = (event) => {
    // console.log("oniceconnectionstatechange ", event);
    // console.log(
    //   "pc.current.iceConnectionState ",
    //   pc.current?.iceConnectionState
    // );
    socket.emit("event", {
      "pc.current.iceConnectionState": peer?.iceConnectionState,
      oniceconnectionstatechange: event,
    });
  };
  peer.onicegatheringstatechange = (event) => {
    // console.log("onicegatheringstatechange ", event);
    socket.emit("event", {
      "pc.current.iceGatheringState": peer?.iceGatheringState,
      onicegatheringstatechange: event,
    });
    // console.log(
    //   "pc.current.iceGatheringState",
    //   pc.current?.iceGatheringState
    // );
  };
  // event end
  return peer;
};
const handleTrackEvent = (event, peer) => {
  stream = event.streams[0];
};
const updateStreamRoom = {};
const allKindUserSoIdToUid = {};
const uidToRoomInfoId = {};

io.of("/updateStream").on("connection", (socket) => {
  socket.on("user_join", (payload) => {
    try {
      const { userUid, roomId, audio, video, share, handRaise } = payload;
      allKindUserSoIdToUid[socket.id] = userUid;
      uidToRoomInfoId[userUid] = roomId;
      if (updateStreamRoom[roomId]) {
        const filterUser = updateStreamRoom[roomId]?.filter(
          (id) => id?.uid !== userUid
        );

        socket.emit("create_peer_request", { filterUser });
        filterUser.push({
          uid: userUid,
          soId: socket.id,
          type: "user",
          audio,
          video,
          share,
          handRaise,
        });
        allKindUserSoIdToUid[socket.id] = userUid;
        uidToRoomInfoId[userUid] = roomId;
        updateStreamRoom[roomId] = filterUser;
        // console.log("mentor",updateStreamRoom[roomId]);
      } else {
        //new array created
        updateStreamRoom[roomId] = [];
        // console.log("new");
        updateStreamRoom[roomId].push({
          uid: userUid,
          soId: socket.id,
          type: "user",
          audio,
          video,
          share,
          handRaise,
        });
        allKindUserSoIdToUid[socket.id] = userUid;
        uidToRoomInfoId[userUid] = roomId;
      }
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("create_peer_signal", (payload) => {
    try {
      const { roomId, selfId, signal, sendTo } = payload;
      const findSelfIdUser = updateStreamRoom?.[roomId]?.find(
        (id) => id?.uid === selfId
      );
      const findSendToUser = updateStreamRoom?.[roomId]?.find(
        (id) => id?.uid === sendTo
      );

      socket
        .to(findSendToUser?.soId)
        .emit("create_peer_signal_send_to_destiny", {
          signal,
          audio: findSelfIdUser?.audio,
          video: findSelfIdUser?.video,
          share: findSelfIdUser?.share,
          type: findSelfIdUser?.type,
          comeFromCreatePeerUid: findSelfIdUser?.uid,
          handRaise: findSelfIdUser?.handRaise,
        });
    } catch (error) {
      new Error(error);
    }
  });
  //mentor side
  socket.on("mentor_join", (payload) => {
    try {
      const { roomId, audio, video, share, mentorUid, handRaise } = payload;
      if (updateStreamRoom[roomId]) {
        const filterMentor = updateStreamRoom?.[roomId]?.filter(
          (id) => id?.uid !== mentorUid
        );
        socket.emit("create_peer_request_to_mentor", {
          filterMentor,
        });
        filterMentor.push({
          uid: mentorUid,
          soId: socket.id,
          type: "mentor",
          audio,
          video,
          share,
          handRaise,
        });
        updateStreamRoom[roomId] = filterMentor;
        allKindUserSoIdToUid[socket.id] = mentorUid;
        uidToRoomInfoId[mentorUid] = roomId;
      } else {
        updateStreamRoom[roomId] = [];
        updateStreamRoom[roomId].push({
          uid: mentorUid,
          soId: socket.id,
          type: "mentor",
          audio,
          video,
          share,
          handRaise,
        });
        allKindUserSoIdToUid[socket.id] = mentorUid;
        uidToRoomInfoId[mentorUid] = roomId;
      }
    } catch (error) {
      new Error(error);
    }
  });
  //add peer signal send destination
  socket.on("add_peer_signal", (payload) => {
    try {
      const { signal, sendTo, roomId, addPeerSignalSender } = payload;
      const findSender = updateStreamRoom?.[roomId]?.find(
        (id) => id?.uid === sendTo
      );
      const addPeerSignalSenderData = updateStreamRoom?.[roomId]?.find(
        (id) => id?.uid === addPeerSignalSender
      );

      socket.to(findSender?.soId).emit("add_peer_to_destiny", {
        signal,
        addPeerSignalSender,
        audio: addPeerSignalSenderData?.audio,
        video: addPeerSignalSenderData?.video,
        share: addPeerSignalSenderData?.share,
        type: addPeerSignalSenderData?.type,
        handRaise: addPeerSignalSenderData?.handRaise,
      });
    } catch (error) {
      new Error(error);
    }
  });

  socket.on("disconnect", () => {
    try {
      const gotUid = allKindUserSoIdToUid[socket.id];
      const roomId = uidToRoomInfoId[gotUid];

      //here  does not need to filter
      updateStreamRoom?.[roomId]?.forEach((element) => {
        if (element.uid !== gotUid) {
          socket.to(element.soId).emit("one_user_leave", { leaveUid: gotUid });
        }
      });
      const filterLeaveUser = updateStreamRoom?.[roomId]?.filter(
        (id) => id?.uid !== gotUid
      );
      updateStreamRoom[roomId] = filterLeaveUser;
    } catch (error) {
      new Error(error);
    }
  });
  //media status regulate
  socket.on("user_mic_status", (payload) => {
    const { micStatus, videoStatus, handRaise, userUid, roomId } = payload;

    updateStreamRoom?.[roomId]?.forEach((id) => {
      socket.to(id.soId).emit("One_user_media_status", {
        userUid,
        micStatus,
        videoStatus,
        handRaise,
      });
    });
    const findUser = updateStreamRoom?.[roomId]?.find(
      (id) => id.uid === userUid
    );
    const filterData = updateStreamRoom?.[roomId]?.filter(
      (id) => id.uid !== userUid
    );
    filterData?.push({
      uid: findUser?.uid,
      soId: findUser?.soId,
      type: findUser?.type,
      audio: micStatus,
      video: videoStatus,
      share: findUser?.share,
      handRaise: handRaise,
    });
    updateStreamRoom[roomId] = filterData;
  });
  //mentor regulate media status to other
  socket.on("mentor_regulate_media status", (payload) => {
    const {
      micStatus,
      videoStatus,
      userUid,
      roomId,
      handRaise,
      whichOne,
      mentorUid,
    } = payload;
    //
    updateStreamRoom?.[roomId]?.forEach((id) => {
      if (id?.uid === userUid) {
        //mentor force to mic on
        socket.to(id?.soId).emit("mentor_force_media", {
          userUid,
          micStatus,
          videoStatus,
          handRaise,
          whichOne,
        });
      } else if (id?.uid !== mentorUid) {
        socket.to(id.soId).emit("One_user_media_status", {
          userUid,
          micStatus,
          videoStatus,
          handRaise,
        });
      }
    });
    const findUser = updateStreamRoom?.[roomId]?.find(
      (id) => id.uid === userUid
    );
    const filterData = updateStreamRoom?.[roomId]?.filter(
      (id) => id.uid !== userUid
    );
    filterData?.push({
      uid: findUser?.uid,
      soId: findUser?.soId,
      type: findUser?.type,
      audio: micStatus,
      video: videoStatus,
      share: findUser?.share,
      handRaise: handRaise,
    });
    updateStreamRoom[roomId] = filterData;

    //
  });
  //force leave
  socket.on("one_student_leave", (payload) => {
    const { userUid, roomId } = payload;

    updateStreamRoom?.[roomId]?.forEach((element) => {
      if (element?.uid !== userUid) {
        socket.to(element.soId).emit("one_user_leave", { leaveUid: userUid });
      }
    });
    const filterLeaveUser = updateStreamRoom?.[roomId]?.filter(
      (id) => id?.uid !== userUid
    );
    updateStreamRoom[roomId] = filterLeaveUser;
  });
  //mentor leave

  socket.on("mentor_leave", (payload) => {
    const { roomId, mentorUid } = payload;
    updateStreamRoom?.[roomId]?.forEach((user) => {
      socket.to(user?.soId).emit("mentor_take_leave");
      delete allKindUserSoIdToUid[user?.soId];
      delete uidToRoomInfoId[user?.uid];
    });
    delete allKindUserSoIdToUid[socket.id];
    delete uidToRoomInfoId[mentorUid];
    delete updateStreamRoom[roomId];
  });
  //message section
  socket.on("message_send", (payload) => {
    const { roomId, uid, status, text, textUid, name } = payload;
    updateStreamRoom?.[roomId]?.forEach((element) => {
      if (element?.uid !== uid) {
        socket.to(element.soId).emit("message_send_to_other", {
          uid,
          status,
          text,
          textUid,
          name,
        });
      }
    });
  });
  //end update stream
});

//for mail route
app.get("/data", async (req, res, next) => {
  try {
    res.json({ data: "data save suc" });
  } catch (error) {
    next(error);
  }
});
// checkout
app.post("/mail", async (req, res, next) => {
  try {
    const { displayFromSideName, toEmail, body, subject, cc, bcc } = req.body;

    if (toEmail.length < 1)
      throw createError.BadRequest("You have to enter sender email... ");
    //mail property
    let transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "noreply.itqanuae@gmail.com",
        pass: "itqan@2021",
      },
    });
    //mail option
    const mailOption = {
      from: `${displayFromSideName} <foo@example.com>`,
      to: toEmail,
      subject: subject,
      text: body,
      cc,
      bcc,
    };
    const send = await transport.sendMail(mailOption);
    //mail option end
    //mail end
    res.send({ data: send });
  } catch (error) {
    console.log(error);
  }
});
//check

//mail route

//register route
// app.post("/register");

//register rote end
//error handel
app.use(async (req, res, next) => {
  next(createError.NotFound());
});

app.use((err, req, res, next) => {
  res.status(err.status || 400);
  res.send({
    error: {
      status: err.status || 400,
      message: err.message,
    },
  });
});

server.listen(process.env.PORT || 4000, () => {
  console.log("The port 4000 is ready to start....");
});
