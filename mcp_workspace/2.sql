use hospital;


CREATE TABLE empl
(
	name VARCHAR(20) not null,
	addr VARCHAR(30),
	adharno CHAR(12) primary key,
	MOBNO char(10) NOT NULL,
	email varchar(20)
);

INSERT INTO empl VALUES

	('raina','raibhavan.p.o.kollam','123456789101','9446905966','raina@gmail.com'),
	('sneha','snehbhavan.p.o.kollam','123456789102','9446905967','sneha@gmail.com'),
	('lily','lilbhavan.p.o.kollam','123456789103','9446905968','lily@gmail.com'),
	('minnu','minnubhavan.p.o.kollam','123456789104','9446905969','minnnu@gmail.com'),
	('hari','haribhavan.p.o.kollam','123456789105','9446905961','hari@gmail.com'),
	('lina','linabhavan.p.o.kollam','123456789106','9446905962','lina@gmail.com');

CREATE TABLE patient
(
	name varchar(20) not null,
	addr varchar(30),
	adharno char(12) primary key,
	age int not null,
	mobno char(10) not null,
	email varchar(20)
);

INSERT INTO patient VALUES

	('tina','tinabhav.p.o.allapy','098765432112',21,'9447334760','tina@gmail.com'),
	('rinu','rinubhav.p.o.allapy','098765432113',32,'9447334761','rinu@gmail.com'),
	('fida','fidabhav.p.o.allapy','098765432114',22,'9447334762','fida@gmail.com'),
	('chinnu','chinbhav.p.o.allapy','098765432115',10,'9447334763','chinnu@gmail.com'),
	('mary','marybhav.p.o.allapy','098765432116',71,'9447334764','mary@gmail.com'),
	('litty','littybhav.p.o.allapy','098765432117',52,'9447334765','litty@gmail.com');

CREATE TABLE test
(
	t_name varchar(20) primary key,
	t_desc varchar(50) not null
);

INSERT INTO test VALUES

	('blood glucose test','to monitor diabetes'),
	('calcium blood test','to monitor kidney test'),
	('cholestrol test','to check cardiovascular diseases'),
	('crp blood test','to check inflammation in body'),
	('hcg test','to monitor pregnancy'),
	('oestrogen test','to monitor pregnancy');

CREATE TABLE scan
(
	s_name varchar(20) primary key,
	s_desc varchar(50) not null,
	s_amnt decimal(12,2) not null
);

INSERT INTO scan VALUES 

	('angiography','to examine blood vessel',2000),
	('ct scan','to get internal body image',650),
	('ecg','to check  heart conditions',1200),
	('mri','to get magnetic image of body',3240),
	('ultrasound','to get pregnancy details',2300),
	('echocardiogram','to scan blood vessel and heart',890);

CREATE TABLE doc
(
	doc_name varchar(20),
	addr varchar(30),
	doc_adharno char(12) primary key,
	speci varchar(20) not null,
	curr_hsp varchar(20) not null
);

INSERT INTO doc VALUES

	('sunil','sunilveedu.p.o.kottayam','098765432180','oncologist','mct hsptl'),
	('manu','manuveedu.p.o.kottayam','098765432181','cardiologist','ncn hsptl'),
	('reena','reenaveedu.p.o.kottayam','098765432182','neurologist','mct hsptl'),
	('rinta','rintaveedu.p.o.kottayam','098765432183','oncologist','mct hsptl'),
	('nila','nilaveedu.p.o.kottayam','098765432184','gynecologist','tna hsptl'),
	('pilla','pillaveedu.p.o.kottayam','098765432185','oncologist','tna hsptl'),
	('neenu','neenuveedu.p.o.kottayam','098765432187','endocronologist','tna hsptl'),
	('sunil','sunilveedu.p.o.kottayam','098765432186','neurologist','mct hsptl');

CREATE TABLE test_p
(
	adharno char(12),
	t_name varchar(20),
	doc_adharno char(12),
	meet_time TIME,
	date_of_test date not null,
	path_to_rpdf varchar(20) not null,
	amnt decimal(12,2) not null,
	primary key(adharno,t_name,date_of_test,doc_adharno,meet_time),
	foreign key (t_name) references test(t_name) on delete cascade on update cascade,
	foreign key (adharno) references patient(adharno) on delete cascade on update cascade,
	foreign key (doc_adharno) references doc(doc_adharno) on delete cascade on update cascade
);

INSERT INTO test_p VALUES
	('098765432113','blood glucose test','098765432187','10:11:11','2024-08-01','/home/detail/rinu',4350.24),
	('098765432112','cholestrol test','098765432186','11:11:11','2024-08-02','/home/detail/teena',500.24),
	('098765432113','cholestrol test','098765432186','11:34:11','2024-08-01','/home/detail/rinu',4345.24),
	('098765432114','hcg test','098765432181','12:11:11','2024-08-06','/home/detail/fida',1350.24),
	('098765432115','blood glucose test','098765432187','12:11:11','2024-08-01','/home/detail/chinnu',4350.24),
	('098765432117','oestrogen test','098765432184','9:00:01','2024-08-06','/home/detail/litty',700),
	('098765432113','blood glucose test','098765432187','12:10:11','2024-08-01',' /home/detail/rinu',3420),
	('098765432115','crp blood test','098765432185','10:00:01','2024-08-07','/home/detail/chinnu',4500),
	('098765432113','calcium blood test','098765432187','12:10:01','2024-08-03','/home/detail/rinu',1500),
	('098765432114','blood glucose test','098765432187','11:01:19','2024-08-05','/home/detail/fida',5550.24);

CREATE TABLE scan_p
(
	adharno char(12),
	s_name varchar(20),
	date_of_scan date not null,
	doc_adharno char(12),
	path_to_rpdf varchar(20) not null,
	path_doc_presc varchar(50) not null,
	primary key(adharno,s_name,date_of_scan,doc_adharno),
	foreign key (s_name) references scan(s_name) on delete cascade on update cascade,
	foreign key (adharno) references patient(adharno) on delete cascade on update cascade,
	foreign key (doc_adharno) references doc(doc_adharno) on delete cascade on update cascade
	
);

INSERT INTO scan_p VALUES
	('098765432116','ct scan','2024-08-05','098765432181','/home/result/mary','/home/desc/manu/mary'),
	('098765432117','mri','2024-08-04','098765432183','/home/result/litty','/home/desc/rinta/litty'),
	('098765432114','ecg','2024-08-05','098765432181','/home/result/fida','/home/desc/manu/fida'),
	('098765432115','ct scan','2024-08-05','098765432181','/home/result/chinnu','/home/desc/manu/chinnu'),
	('098765432112','ultrasound','2024-08-04','098765432184','/home/result/teena','/home/desc/nila/teena'),
	('098765432116','mri','2024-08-03','098765432183','/home/result/mary','/home/desc/rinta/mary');

//q1
select patient.name,test.t_name,test_p.date_of_test,test.t_desc from test_p join patient on test_p.adharno = patient.adharno join test on test_p.t_name = test.t_name where test_p.date_of_test = '2024-08-01' group by patient.name,test.t_name,test_p.date_of_test,test.t_desc;

//q2
select count(*),t_name from test_p group by t_name;

//q3
 create view minmax as select t_name,count(t_name) as count from test_p group by t_name;
select t_name from minmax where minmax.count = (select max(count) from minmax);
select t_name from minmax where minmax.count = (select min(count) from minmax);

//q4
select distinct name,patient.adharno  from patient join scan_p on patient.adharno = scan_p.adharno where scan_p.adharno in(select adharno from scan_p group by s_name,adharno having count(*)<=2);

//q5
select sum(amnt),t_name from test_p group by t_name;
select s_name,s_amnt from scan;

//q6
select min(date_of_scan) as least_recent,max(date_of_scan) as most_recently,scan_p.s_name from scan join scan_p on scan.s_name = scan_p.s_name group by s_name;

//q7

