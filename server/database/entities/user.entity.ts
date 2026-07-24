import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'users' })
@Index('uq_users_email', ['email'], { unique: true })
@Index('uq_users_name', ['name'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_users',
  })
  id!: number

  @Column({ type: 'text', nullable: false })
  email!: string

  /** 唯一 handle，作为 /u/[name] 的标识 */
  @Column({ type: 'text', nullable: false })
  name!: string

  @Column({ name: 'display_name', type: 'text', nullable: false })
  displayName!: string

  @Column({ name: 'avatar_hue', type: 'text', default: '#00a1d6' })
  avatarHue!: string

  @Column({ type: 'text', default: '' })
  bio!: string

  @Column({ name: 'password_hash', type: 'text', nullable: false })
  passwordHash!: string

  @Column({ type: 'text', default: 'creator' })
  role!: string

  /** 粉丝数（被多少用户关注），冗余计数。 */
  @Column({ name: 'followers_count', type: 'integer', default: 0 })
  followersCount!: number

  /** 关注数（关注了多少用户），冗余计数。 */
  @Column({ name: 'following_count', type: 'integer', default: 0 })
  followingCount!: number

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date
}
